const FusekiTestTool = require('./fuseki-test-tool');
const config = require('./config');
const fs = require('fs');
const chalk = require('chalk');
const path = require('path');

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

    for (const file of files) {
      console.log(chalk.yellow(`Processing file: ${file}`));

      const filePath = path.join(inputFolder, file);
      const exampleData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const datasetName = exampleData.dataset || 'testDataset';

      try {
        const datasetsResponse = await fuseki.listDatasets();
        if (!datasetsResponse.success) {
          console.error(chalk.red('Error: Failed to list datasets'));
          continue;
        }

        const datasets = datasetsResponse.msg.datasets.map((dataset) => dataset["ds.name"]);
        if (!datasets.includes(datasetName)) {
          const createDatasetResponse = await fuseki.createDataset(datasetName, { type: 'mem' });
          if (!createDatasetResponse.success) {
            console.error(chalk.red(`Error: Failed to create dataset ${datasetName}`));
            continue;
          }
        }

        const rdfData = exampleData.data.map(
          ({ s: subject, p: predicate, o: object }) =>
            `<${subject}> <${predicate}> <${object}> .`
        ).join('\n');

        const addDataResponse = await fuseki.addData({ data: rdfData, dataset: datasetName });
        if (!addDataResponse.success) {
          console.error(chalk.red('Error: Failed to add data to dataset'));
          continue;
        }

        for (const queryObj of exampleData.queries) {
          console.log(chalk.blue(`Running query: ${queryObj.name}`));
          console.log(chalk.gray(`Description: ${queryObj.description}`));

          const sparqlQuery = queryObj.sparql;
          const expectedResults = queryObj.expected.result?.map((binding) => {
            const result = {};
            for (const key in binding) {
              result[key] = binding[key];
            }
            return result;
          });

          const params = {
            sparqlQuery,
            dataset: datasetName,
            expectedResults: expectedResults || [],
          }

          if (queryObj.expected.length) {
            params.expectedLength = queryObj.expected.length;
          }

          const assertResponse = await fuseki.assertQuery(params);

          if (!assertResponse.success) {
            console.error(chalk.red('Assertion Failed:'), assertResponse.msg);
          } else {
            console.log(chalk.green('Assertion Passed!'));
          }
        }

        const deleteDatasetResponse = await fuseki.deleteDataset(datasetName);
        if (!deleteDatasetResponse.success) {
          console.error(chalk.red(`Error: Failed to delete dataset ${datasetName}`));
        }
      } catch (error) {
        console.error(chalk.red(`Error processing file ${file}:`), error.message);
      }
    }
  } catch (error) {
    console.error(chalk.red('Unexpected error:'), error.message);
  }
})();
