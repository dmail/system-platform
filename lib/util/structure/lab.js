/* eslint-disable no-use-before-define */

import util from './util.js';

// Data, PrimitiveData -> pref this
// Variable, PrimitiveVariable
// Twin
// Mirror
// Shadow -> j'aime beaucoup shadow, dans l'idée du shadow dom en plus
// Derived
// Trace -> le meilleur je pense parce que shadow c'est trop connoté et trace c'est plus générique
// Chemistry?
// Lab ? -> j'aime ça pour laboratory
// Sandbox
// y'aurais donc Lab.scan
// Pharmacy, Atom (on a déjà Link qui sers à lié des atomes)
// Formula, Recipe, Composition
// synthesize
// https://fr.wikipedia.org/wiki/Chimie#Structure_de_la_mati.C3.A8re

/*
What we want first is to create an object per JavaScript value type
This is the Lab object below that will return element corresponding to value using Lab.scan(value)
*/
const Lab = util.extend({
    scan(value) {
        const element = this.from(value);
        element.initialize(value);
        return element;
    },

    from(value) {
        const ElementMatchingValue = this.findElementByValueMatch(value);
        const element = ElementMatchingValue.create();
        return element;
    },

    findElementByValueMatch(value) {
        if (arguments.length === 0) {
            throw new Error('Lab.findElementByValueMatch expect one arguments');
        }
        let ElementMatchingValue = this.Elements.find(function(Element) {
            return Element.match(value);
        });
        if (!ElementMatchingValue) {
            throw new Error('no registered element matches value ' + value);
        }
        return ElementMatchingValue;
    },
    Elements: []
});

/*
Add createElement() which can create an element of the right type using its name
*/
Lab.define({
    createElement(name, value) {
        const ElementMatchingName = this.findElementByName(name);
        const element = ElementMatchingName.create();
        if (arguments.length === 1) {
            element.initialize();
        } else {
            element.initialize(value);
        }
        return element;
    },

    findElementByName(name) {
        if (arguments.length === 0) {
            throw new Error('Lab.findElementByName expect one arguments');
        }
        let ElementUsignName = this.Elements.find(function(Element) {
            return Element.name === name;
        });
        if (!ElementUsignName) {
            throw new Error('no registered element named ' + name);
        }
        return ElementUsignName;
    }
});

/*
Create the Element object, basically it's just a wrapper to a JavaScript value
- match() method is used to know if the Element matches the value
- createDefaultValue() is usefull when Element is created without value
- extend() creates a new Element and register it inside the Lab
*/
const Element = util.extend({
    match() {

    },

    constructor() {

    },

    initialize() {
        let value;
        if (arguments.length > 0) {
            value = arguments[0];
        } else {
            value = this.createDefaultValue();
        }
        this.value = value;
        this.initializer(value);
    },

    createDefaultValue() {

    },

    initializer() {

    },

    extend(name, ...args) {
        const Element = util.extend.apply(this, args);
        Element.name = name;
        Lab.register(Element, this);
        return Element;
    }
});

/*
Add the Lab.register method
*/
Lab.define({
    register(Element, ExtendedElement) {
        let ExtendedElementIndex;

        if (ExtendedElement) {
            ExtendedElementIndex = this.Elements.indexOf(ExtendedElement);
        } else {
            ExtendedElementIndex = -1;
        }

        if (ExtendedElementIndex === -1) {
            this.Elements.push(Element);
        } else {
            this.Elements.splice(ExtendedElementIndex, 0, Element);
        }
    }
});

/*
We kown that some element will need to be linked with other element(s)
So we prepare a link property and a Link object
*/
Element.define({
    link: null
});

const Link = util.extend({
    constructor(element) {
        this.element = element;
    },
    element: null
});

/* we also need an object able to manipulate a list of link when an element is linked to an other by more than 1 link */
const LinkList = util.extend({
    constructor() {
        this.length = 0;
    },

    push: Array.prototype.push,
    indexOf: Array.prototype.indexOf,
    splice: Array.prototype.splice,
    findIndex: Array.prototype.findIndex
});

/*
our objects are ready but we are missing an important method allowing Link to create a linkedElement
and alongside we want to allow element to point other elements so we'll need iteration methods to discover
previousElement
*/
Link.define({
    createLinkedElement(value) {
        let element = Lab.from(value);
        element.link = this;

        let previousElementUsingSameValue;
        if (element.referencable) {
            previousElementUsingSameValue = this.findPreviousElementByValue(value);
        }

        if (previousElementUsingSameValue) {
            console.log('make element a pointer on', value);
            element.pointTo(previousElementUsingSameValue);
        } else {
            element.initialize(value);
        }

        return element;
    },

    findPreviousElementByValue(value) {
        let previousElementUsingSameValue;
        let previousElement;
        let lastElement = this.getLastElement();

        if (lastElement) {
            previousElement = lastElement;
        } else {
            previousElement = this.element;
        }

        if (previousElement.value === value) {
            previousElementUsingSameValue = previousElement;
        } else {
            for (previousElement of previousElement.createPreviousElementIterable()) {
                if (previousElement.value === value) {
                    previousElementUsingSameValue = previousElement;
                    break;
                }
            }
        }

        return previousElementUsingSameValue;
    },

    getLastElement() {
        return null;
    }
});

Element.define({
    // the below methods belongs to link
    // in fact we could create a previousIterator yielding [link, element] and other yielding only link or only element
    // Element.prototype.previousElements() :  would create an iterator from the link property or return empty iterable
    // Element.prototoype.previousLinks() : would create an iterator from the link property or return empty iterable
    // because even getPrevious second line tries to check if element has a link and use link methods to navigate
    // so Element should not provide any method related to iteration except getDeepestOrSelf
    createPreviousElementIterable() {
        let element = this;

        return createIterable(function() {
            let previousElement = element.getPrevious();
            element = previousElement;

            const result = {
                done: !previousElement,
                value: previousElement
            };
            return result;
        });
    },

    getPrevious() {
        let previous;

        const link = this.link;
        if (link) {
            const elementBefore = link.getElementBefore(this);
            if (elementBefore) {
                previous = elementBefore.getDeepestOrSelf();
            } else {
                previous = link.element;
            }
        } else {
            previous = null;
        }

        return previous;
    }
});

Link.define({
    getElementBefore() {
        return null;
    }
});

Element.define({
    getDeepestOrSelf() {
        return this;
    }
});

// LinkList must also provide some methods for iteration
LinkList.define({
    getDeepestElement() {
        let deepestElement;

        let lastLinkLastElement = this.getLastLinkLastElement();
        if (lastLinkLastElement) {
            deepestElement = lastLinkLastElement.getDeepestOrSelf();
        } else {
            deepestElement = null;
        }

        return deepestElement;
    },

    getLastLinkLastElement() {
        let lastElement;

        const list = this;
        const listLength = list.length;
        if (listLength === 0) {
            lastElement = null;
        } else {
            const lastLink = list[listLength - 1];
            lastElement = lastLink.getLastElement();
        }

        return lastElement;
    }
});

function createIterable(nextMethod) {
    return {
        [Symbol.iterator]: function() {
            return this;
        },
        next: nextMethod
    };
}

Element.define({
    // createPointer() {
    //     const pointerData = Trace.create(this.value);
    //     pointerData.pointTo(this);
    //     return pointerData;
    // },

    pointTo(element) {
        // here we should remove all stuff relative to populate()
        // like children and other properties created by it
        // an other way to do this would be to create a new node with only.data property
        // and to do this.replace(pointerNode)

        const pointedElement = element.pointedElement;
        if (pointedElement) {
            element = pointedElement;
        }
        this.value = element.value;
        this.pointedElement = element;
        element.addPointer(this);

        return this;
    },

    addPointer(pointer) {
        if (this.hasOwnProperty('pointers') === false) {
            this.pointers = [];
        }
        this.pointers.push(pointer);
    },
    pointers: []
});

/*
At this point we have Lab, Element, Link & LinkList that the core objects that we'll be used to describe any JavaScript value
*/

Lab.Element = Element;
Lab.Link = Link;
Lab.LinkList = LinkList;

export default Lab;

// unit test in the file are because that way they are as close as possible from what they are testing
// the next step would be to be able to declare unit test next to what they are testing
// right now they are always grouped together at the end of the file, it may change later to allow this

export const test = {
    modules: ['@node/assert'],

    main() {

    }
};