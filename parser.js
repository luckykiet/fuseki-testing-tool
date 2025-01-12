const { Parser } = require('n3');

const parseTurtle = (turtle) => {
    const parser = new Parser();
    const quads = parser.parse(turtle);
    return quads.map(quad => ({
        s: quad.subject.value,
        p: quad.predicate.value,
        o: quad.object.value,
        g: quad.graph.value || null,
    })) || [];
};

const convertToTurtleWithNoPrefixes = (data) => {
    if (!data || !Array.isArray(data)) {
        return '';
    }
    return data.map(({ s: subject, p: predicate, o: object }) => {
        const formattedObject = object.startsWith('http://') || object.startsWith('https://')
            ? `<${object}>`
            : `"${object}"`;
        return `<${subject}> <${predicate}> ${formattedObject} .`;
    }).join('\n');
};

module.exports = { parseTurtle, convertToTurtleWithNoPrefixes };