import {at, expect, present} from 'helper/detect.js';
import parent from '../feature.js';

const methodName = 'codePointAt';
const feature = {
    dependencies: [parent],
    run: at(parent.run, methodName),
    test: expect(present),
    solution: {
        type: 'inline',
        value: fix
    }
};

import {objectIsCoercible} from 'helper/fix.js';
// https://developer.mozilla.org/fr/docs/Web/JavaScript/Reference/Objets_globaux/String/codePointAt
function codePointAt(position) {
    objectIsCoercible(this);
    var string = String(this);
    var size = string.length;
    // `on transforme en entier`
    var index = position ? Number(position) : 0;
    if (isNaN(index)) {
        index = 0;
    }
    // on regarde si on est en dehors de la chaîne:
    if (index < 0 || index >= size) {
        return undefined;
    }
    // On récupère le premier codet
    var first = string.charCodeAt(index);
    var second;
    if ( // on vérifie que ce n'est pas le début d'une surrogate pair
        first >= 0xD800 && first <= 0xDBFF && // high surrogate
        size > index + 1 // il y a un codet qui suit
    ) {
        second = string.charCodeAt(index + 1);
        if (second >= 0xDC00 && second <= 0xDFFF) { // low surrogate
            // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
            return (first - 0xD800) * 0x400 + second - 0xDC00 + 0x10000;
        }
    }
    return first;
}

import {defineMethod} from 'helper/fix.js';
function fix() {
    defineMethod(at(parent.run).value, methodName, codePointAt);
}

export default feature;
export {codePointAt, fix};