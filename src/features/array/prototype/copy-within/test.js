import {at, present} from '/test-helpers.js';

const test = {
    run: at('Array', 'prototype', 'copyWithin'),
    complete: present
};

export default test;
