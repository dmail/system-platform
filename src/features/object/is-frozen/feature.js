expose(
    {
        code: feature.runStandard(parent, 'isFrozen'),
        pass: parent.pass,
        solution: {
            type: 'corejs',
            value: 'es6.object.is-frozen'
        }
    }
);
