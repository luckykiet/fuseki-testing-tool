# Fuseki Testing Tool in NodeJS

This tool helps to provide unit tests on Fuseki server. 

## Documentations
- [Fuseki API](https://jena.apache.org/documentation/fuseki2/fuseki-server-protocol.html)

## Requirements
- [Java 23](https://openjdk.org/) and above
- [Fuseki server 5.2.0](https://jena.apache.org/download/) and above
- [NodeJS v20.9.0](https://nodejs.org/en/download) and above

## Installation
1. Install NodeJS
2. Clone this repository
```
git clone https://github.com/luckykiet/fuseki-testing-tool.git
```
3. Install depedencies
```
cd fuseki-testing-tool
yarn install
```
4. Install Fuseki server or use preinstalled fuseki server
- for Windows follow [this instruction](https://github.com/nvbach91/4IZ441/wiki/Apache-Jena-Fuseki)
- for MacOS or Linux based OS follow [this instruction](macos/README.md)

## Usage
1. Run Fuseki server
2. (Optional) Run preinstalled fuseki server
```
yarn fuseki
```
3. Modify [config.js](config.js) if needed
4. Create testing examples base on [schema.json](schema.json) or prepared in _input_ folder.
5. Run application
```
yarn start
```

## Outputs

If the test passed, user will receive a message in command line:
```
Running query: Query name
Description: This will run a query as an example.
Assertion Passed!
```

If some test fails, the user will receive a message:

- as a string – for bad turtle or SPARQL code or file does not exist or a system error
```
Running query: Query name
Description: This will run a query as an example.
Assertion Failed:
Error message here
```
- as an object – for the assertion
```
Running query: Query name
Description: This will run a query as an example.
Assertion Failed:
{
  error: 'Assertion Failed',
  expected: [
    {
      s: 'http://example.org/subject4',
      p: 'http://example.org/predicate3',
      o: 'http://example.org/object5'
    }
  ],
  actual: [
    {
      s: 'http://example.org/subject1',
      p: 'http://example.org/predicate2',
      o: 'http://example.org/object3'
    }
  ]
}
```
