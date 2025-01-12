const FusekiTestTool = require('./fuseki-test-tool');
const config = require('./config');
const fs = require('fs');
const chalk = require('chalk');
const path = require('path');
const parser = require('./parser');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'schema.json'), 'utf8'));

const ajv = new Ajv();
addFormats(ajv);
const validate = ajv.compile(schema);

const inputFolder = path.join(__dirname, config.inputFolder);
const fuseki = new FusekiTestTool(config.url);

(async () => {
  try {
    console.log(chalk.cyan('Starting Fuseki Test Tool...'));

    const pingResponse = await fuseki.ping();
    if (!pingResponse.success) {
      console.error(chalk.red('Error: Fuseki server is not reachable'));
      return;
    }

    const files = fs.readdirSync(inputFolder).filter((file) => file.endsWith('.json'));

    if (files.length === 0) {
      console.error(chalk.red('Error: No JSON files found in the input folder'));
      return;
    }

    const results = {
      passed: [],
      failed: []
    };

    for (const file of files) {
      console.log(chalk.gray(Array(40).fill('-').join('')));
      console.log(chalk.yellow(`Processing file: ${file}`));

      const filePath = path.join(inputFolder, file);
      let exampleData;

      try {
        exampleData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const isValid = validate(exampleData);

        if (!isValid) {
          console.error(
            chalk.red(`Validation failed for ${file}:`),
            validate.errors.map((err) => `${err.instancePath} ${err.message}`).join(', ')
          );
          results.failed.push(file);
          continue;
        }
      } catch (error) {
        console.error(chalk.red(`Error reading or validating file ${file}:`), error.message);
        results.failed.push(file);
        continue;
      }

      const datasetName = exampleData.dataset || 'testDataset';

      try {
        const datasetsResponse = await fuseki.listDatasets();
        if (!datasetsResponse.success) {
          console.error(chalk.red('Error: Failed to list datasets', datasetsResponse.msg));
          results.failed.push(file);
          continue;
        }

        const datasets = datasetsResponse.msg.datasets.map((dataset) => dataset['ds.name']);

        if (!datasets.includes(`/${datasetName}`)) {
          const createDatasetResponse = await fuseki.createDataset(datasetName, { type: 'mem' });
          if (!createDatasetResponse.success) {
            console.error(chalk.red(`Error: Failed to create dataset ${datasetName}`), createDatasetResponse.msg);
            results.failed.push(file);
            continue;
          }
        }

        let rdfData = [];
        const exampleContent = exampleData.data;
        if (typeof exampleContent === 'string') {
          try {
            const dataFilePath = path.join(inputFolder, exampleContent);
            const turtle = fs.readFileSync(dataFilePath, 'utf8');
            const parsedData = parser.parseTurtle(turtle);
            rdfData = parsedData;
          } catch (error) {
            console.error(chalk.red(`Error reading file ${exampleContent}`), error.message);
            results.failed.push(file);
            continue;
          }
        } else {
          rdfData = exampleContent;
        }

        const addDataResponse = await fuseki.addData({ data: rdfData, dataset: datasetName });
        if (!addDataResponse.success) {
          console.error(chalk.red('Error: Failed to add data to dataset', addDataResponse.msg));
          results.failed.push(file);
          continue;
        }

        let allQueriesPassed = true;

        for (const queryObj of exampleData.queries) {
          console.log(chalk.blue(`Running query: ${queryObj.name}`));
          console.log(chalk.gray(`Description: ${queryObj.description}`));

          let sparqlQuery = '';
          if (typeof queryObj.sparql === 'string') {
            try {
              const dataFilePath = path.join(inputFolder, queryObj.sparql);
              sparqlQuery = fs.readFileSync(dataFilePath, 'utf8');
            } catch (error) {
              sparqlQuery = queryObj.sparql;
            }
          } else {
            sparqlQuery = queryObj.sparql;
          }

          const expectedResults = Array.isArray(queryObj.expected.result)
            ? queryObj.expected.result.map((binding) => {
              const result = {};
              for (const key in binding) {
                result[key] = binding[key];
              }
              return result;
            })
            : typeof queryObj.expected.result === 'boolean' ? queryObj.expected.result : queryObj.expected.result || "";

          const params = {
            sparqlQuery,
            dataset: datasetName,
            expectedResults: expectedResults,
          };

          if (queryObj.expected.length) {
            params.expectedLength = queryObj.expected.length;
          }

          const assertResponse = await fuseki.assertQuery(params);

          if (!assertResponse.success) {
            console.error(chalk.red('Assertion Failed:'));
            console.dir(assertResponse.msg, { depth: null });
            allQueriesPassed = false;
          } else {
            console.log(chalk.green('Assertion Passed!'));
          }
          if (queryObj !== exampleData.queries[exampleData.queries.length - 1]) {
            console.log(chalk.magenta(Array(30).fill('-').join('')));
          }
        }

        const deleteDatasetResponse = await fuseki.deleteDataset(datasetName);
        if (!deleteDatasetResponse.success) {
          console.error(chalk.red(`Error: Failed to delete dataset ${datasetName}`), deleteDatasetResponse.msg);
        }

        if (allQueriesPassed) {
          results.passed.push(file);
        } else {
          results.failed.push(file);
        }
      } catch (error) {
        console.error(chalk.red(`Error processing file ${file}:`), error.message);
        results.failed.push(file);
      }
      console.log(chalk.gray(Array(40).fill('-').join('')));
      if (file !== files[files.length - 1]) {
        console.log('\n\n');
      }
    }

    console.log(chalk.cyan('\nSummary:'));
    console.log(chalk.green(`Passed files: ${results.passed.length}`));
    console.log(results.passed);
    if (results.failed.length > 0) {
      console.log(chalk.red(`Failed files: ${results.failed.length}`));
      console.log(results.failed);
    } else {
      console.log(chalk.green('All files passed!'));
    }
  } catch (error) {
    console.error(chalk.red('Unexpected error:'), error.message);
  }
})();
