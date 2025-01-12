const axios = require('axios');
const qs = require('qs');
const _ = require('lodash');
const { convertToTurtleWithNoPrefixes } = require('./parser');
const SparqlParser = require('sparqljs').Parser;

class FusekiTestTool {
    constructor(endpoint) {
        this.client = axios.create({
            baseURL: endpoint,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
    }

    async handleRequest(request) {
        try {
            const response = await request();
            return { success: true, msg: response.data };
        } catch (error) {
            return {
                success: false,
                msg: error.response?.data || error.message || 'Unknown error',
            };
        }
    }

    async ping() {
        return this.handleRequest(() => this.client.get('/$/ping'));
    }

    async getServerInfo() {
        return this.handleRequest(() => this.client.get('/$/server'));
    }

    async listDatasets() {
        return this.handleRequest(() => this.client.get('/$/datasets'));
    }

    async getDatasetInfo(datasetName) {
        return this.handleRequest(() => this.client.get(`/$/datasets/${datasetName}`));
    }

    async createDataset(datasetName, datasetConfig) {
        return this.handleRequest(() =>
            this.client.post(
                '/$/datasets',
                qs.stringify({
                    dbName: datasetName,
                    dbType: datasetConfig.type || 'tdb2',
                    ...datasetConfig,
                }),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                }
            )
        );
    }

    async deleteDataset(datasetName) {
        return this.handleRequest(() => this.client.delete(`/$/datasets/${datasetName}`));
    }

    async compactDataset(datasetName, deleteOld = true) {
        return this.handleRequest(() =>
            this.client.post(`/$/compact/${datasetName}`, null, {
                params: { deleteOld },
            })
        );
    }

    async getStats() {
        return this.handleRequest(() => this.client.get('/$/stats'));
    }

    async getDatasetStats(datasetName) {
        return this.handleRequest(() => this.client.get(`/$/stats/${datasetName}`));
    }

    async backupDataset(datasetName) {
        return this.handleRequest(() => this.client.post(`/$/backup/${datasetName}`));
    }

    async listBackups() {
        return this.handleRequest(() => this.client.get('/$/backups-list'));
    }

    async getMetrics() {
        return this.handleRequest(() => this.client.get('/$/metrics'));
    }

    async sleepServer() {
        return this.handleRequest(() => this.client.post('/$/sleep'));
    }

    async listTasks() {
        return this.handleRequest(() => this.client.get('/$/tasks'));
    }

    async getTaskDetails(taskName) {
        return this.handleRequest(() => this.client.get(`/$/tasks/${taskName}`));
    }

    async addData({ data, dataset, contentType = 'text/turtle' }) {
        if (!Array.isArray(data)) {
            return { success: false, msg: 'Data should be an array' };
        }

        const graphData = {};
        const undefinedGraphData = [];

        data.forEach((quad) => {
            if (quad.g) {
                if (!graphData[quad.g]) {
                    graphData[quad.g] = [];
                }
                graphData[quad.g].push(quad);
            } else {
                undefinedGraphData.push(quad);
            }
        });

        const allGraphData = [
            ...Object.entries(graphData),
            [null, undefinedGraphData]
        ];

        const errors = [];

        for (const [graph, quads] of allGraphData) {
            if (quads.length === 0) continue;
            const url = `/${dataset}/data${graph ? `?graph=${encodeURIComponent(graph)}` : ''}`;
            const body = convertToTurtleWithNoPrefixes(quads);
            try {
                const response = await this.handleRequest(() =>
                    this.client.post(url, body, {
                        headers: { 'Content-Type': contentType },
                    })
                );

                if (!response.success) {
                    errors.push(`Graph: ${graph || 'default'} - ${response.msg}`);
                }
            } catch (err) {
                errors.push(`Graph: ${graph || 'default'} - ${err.message}`);
            }
        }

        if (errors.length > 0) {
            return { success: false, msg: errors };
        }

        return { success: true, msg: 'Data added successfully' };
    }

    async query({ sparqlQuery, dataset, queryType = 'select' }) {
        const url = `/${dataset}/?query=${encodeURIComponent(sparqlQuery)}`;
        const acceptHeader =
            queryType === 'select'
                ? 'application/sparql-results+json'
                : queryType === 'construct'
                    ? 'application/ld+json'
                    : 'text/plain';

        return this.handleRequest(() =>
            this.client.get(url, {
                headers: { Accept: acceptHeader },
            })
        );
    }

    async update({ sparqlQuery, dataset }) {
        const url = `/${dataset}/update`;
        return this.handleRequest(() =>
            this.client.post(
                url,
                qs.stringify({ update: sparqlQuery }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            )
        );
    }

    async deleteData(graphUri = null) {
        const url = `/data${graphUri ? `?graph=${encodeURIComponent(graphUri)}` : ''}`;
        return this.handleRequest(() => this.client.delete(url));
    }

    async assertQuery({ sparqlQuery, expectedResults, expectedLength, dataset }) {
        try {
            const parser = new SparqlParser();
            const parsedQuery = parser.parse(sparqlQuery);
            const queryTypeDetected = this.detectQueryType(parsedQuery);

            const operation =
                queryTypeDetected === 'update'
                    ? this.update({ sparqlQuery, dataset })
                    : this.query({ sparqlQuery, dataset, queryType: queryTypeDetected });

            const results = await operation;
            if (!results.success) {
                return results;
            }

            let actualResults;
            if (queryTypeDetected === 'construct') {
                const graph = results.msg['@graph'] || [];
                actualResults = graph.flatMap((entry) => {
                    const subject = entry['@id'];
                    const triples = [];

                    for (const [predicate, object] of Object.entries(entry)) {
                        if (predicate === '@id' || predicate === '@type') {
                            continue;
                        }

                        if (object['@id']) {
                            triples.push({ s: subject, p: predicate, o: object['@id'] });
                        } else {
                            triples.push({ s: subject, p: predicate, o: object });
                        }
                    }

                    if (entry['@type']) {
                        triples.push({ s: subject, p: 'rdf:type', o: entry['@type'] });
                    }

                    return triples;
                });
            } else if (queryTypeDetected === 'select') {
                actualResults = results.msg.results.bindings.map((binding) =>
                    Object.fromEntries(Object.entries(binding).map(([key, value]) => [key, value.value]))
                );
            } else if (queryTypeDetected === 'ask') {
                actualResults = results.msg.trim().toLowerCase() === 'yes';
            } else {
                return {
                    success: expectedResults === results.msg,
                    msg: {
                        error: expectedResults === results.msg ? null : 'Assertion Failed',
                        expected: expectedResults,
                        actual: results.msg,
                    },
                };
            }

            if ((['select', 'construct'].includes(queryTypeDetected)) && !/ORDER BY/i.test(sparqlQuery)) {
                const sortLexicographically = (data) => {
                    if (!Array.isArray(data) || !data.length) {
                        return [];
                    }
                    return _.sortBy(data, Object.keys(data[0]));
                };

                expectedResults = Array.isArray(expectedResults) ? sortLexicographically(expectedResults) : expectedResults;
                actualResults = sortLexicographically(actualResults);
            }

            if (_.isEqual(actualResults, expectedResults)) {
                if (expectedLength && !isNaN(expectedLength) && actualResults.length !== expectedLength) {
                    return {
                        success: false,
                        msg: {
                            error: 'Assertion Failed',
                            expectedLength: expectedLength,
                            actualLength: actualResults.length,
                        },
                    };
                }
                return { success: true, msg: 'Assertion Passed' };
            }

            if (expectedResults !== undefined && expectedResults !== '') {
                return {
                    success: false,
                    msg: {
                        error: 'Assertion Failed',
                        expected: expectedResults,
                        actual: actualResults,
                    },
                };
            }

            if (!expectedResults.length && expectedLength && !isNaN(expectedLength)) {
                if (actualResults.length !== expectedLength) {
                    return {
                        success: false,
                        msg: {
                            error: 'Assertion Failed',
                            expectedLength: expectedLength,
                            actualLength: actualResults.length,
                        },
                    };
                }
                return { success: true, msg: 'Assertion Passed' };
            }

            return {
                success: false,
                msg: {
                    error: 'Assertion Failed',
                    expected: expectedResults,
                    actual: actualResults,
                },
            };
        } catch (error) {
            return {
                success: false,
                msg: error.message || 'Unknown error during assertion',
            };
        }
    }

    detectQueryType(parsedQuery) {
        if (parsedQuery.type === 'query') {
            return parsedQuery.queryType.toLowerCase();
        }
        if (parsedQuery.type === 'update') {
            return 'update';
        }
        throw new Error('Unsupported SPARQL query type');
    }
}

module.exports = FusekiTestTool;
