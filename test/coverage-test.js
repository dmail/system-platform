import jsenv from 'jsenv';

// import assert from '@node/assert';

// donc pour coverage il faut voir le coverage object qu'on obtient
// puis vérifier que remap marche bien

jsenv.generate({logLevel: 'info'}).then(function(env) {
    var source = `
    export default function() {
        return true;
    }
    `;
    var sourceAddress = 'anonymous';

    env.config(function() {
        return env.import('env/module-coverage').then(function(exports) {
            var coverage = exports.default.create({
                urlIsPartOfCoverage(url) {
                    return url.includes('anonymous');
                }
            });

            env.coverage = coverage;

            return coverage.install(env);
        });
    });

    // env.run(function() {
    //     // execute the mainAction exports.default before generating the coverage
    //     // what we could do is simply to manually generated the coverage after we exports.default();
    //     env.mainAction.result.default();
    // });

    return env.evalMain(source, sourceAddress).then(function(exports) {
        return exports.default();
    }).then(function() {
        return env.coverage.collect();
    }).then(function(coverage) {
        console.log('coverage', coverage);
    });
});
