const FusekiTestTool = require('./fuseki-test-tool');
const config = require('./config');

const fuseki = new FusekiTestTool(config.url);

const datasetName = 'testDataset';
(async () => {
  try {
    const pingResponse = await fuseki.ping();
    console.log('Ping Response:', pingResponse);

    const datasetsResponse = await fuseki.listDatasets();
    if (datasetsResponse.success) {
      console.log('Datasets:', datasetsResponse.msg.datasets);
    } else {
      console.error('Error:', datasetsResponse.msg);
    }

    const createDatasetResponse = await fuseki.createDataset('testDataset', { type: 'mem' });
    console.log('Create Dataset:', createDatasetResponse);

    const rdfData = `
      @prefix ex: <http://example.org/> .
      ex:subject ex:predicate "object" .
    `;
    const addDataResponse = await fuseki.addData({ data: rdfData, dataset: datasetName });
    console.log('Add Data:', addDataResponse);

    const query = `
      PREFIX ex: <http://example.org/>
      SELECT ?s ?p ?o WHERE {
        ?s ?p ?o .
      }
    `;

    const expectedResults = [
      { s: 'http://example.org/subject', p: 'http://example.org/predicate', o: 'object' },
    ];

    const assertResponse = await fuseki.assertQuery({ sparqlQuery: query, dataset: datasetName, expectedResults });
    console.log('Assert Query Response:', assertResponse);

    if (!assertResponse.success) {
      console.error('Assertion Failed:', assertResponse.msg);
    } else {
      console.log('Assertion Passed:', assertResponse.msg);
    }


    const deleteDatasetResponse = await fuseki.deleteDataset(datasetName);
    console.log('Delete Dataset:', deleteDatasetResponse);
  } catch (error) {
    console.error('Unexpected error:', error.message);
  }
})();
