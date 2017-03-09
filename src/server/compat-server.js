/*
- performance now polyfill :
https://gist.github.com/paulirish/5438650

*/

// import require from '@node/require';
// import env from '@jsenv/env';

import rest from '@jsenv/rest';
import Url from '@jsenv/url';

import Server from './server.js';
import createFileService from './file-service.js';

const myRest = rest;
const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'].join(', '),
    'access-control-allow-headers': ['x-requested-with', 'content-type', 'accept'].join(', '),
    'access-control-max-age': 1 // Seconds
};
myRest.use({
    intercept(request, response) {
        Object.keys(corsHeaders).forEach(function(corsHeaderName) {
            response.headers.append(corsHeaderName, corsHeaders[corsHeaderName]);
        });
    }
});

function createRequestFromNodeRequest(nodeRequest, serverUrl) {
    const requestProperties = {
        method: nodeRequest.method,
        url: Url.create(nodeRequest.url, serverUrl).toString(),
        headers: nodeRequest.headers
    };
    if (
        requestProperties.method === 'POST' ||
        requestProperties.method === 'PUT' ||
        requestProperties.method === 'PATCH'
    ) {
        requestProperties.body = nodeRequest;
    }

    const request = myRest.createRequest(requestProperties);
    return request;
}
function syncNodeResponseAndResponse(response, nodeResponse) {
    nodeResponse.writeHead(response.status, response.headers.toJSON());

    var keepAlive = response.headers.get('connection') === 'keep-alive';

    if (response.body) {
        if (response.body.pipeTo) {
            return response.body.pipeTo(nodeResponse);
        }
        if (response.body.pipe) {
            response.body.pipe(nodeResponse);
        } else {
            nodeResponse.write(response.body);
            if (keepAlive === false) {
                nodeResponse.end();
            }
        }
    } else if (keepAlive === false) {
        nodeResponse.end();
    }
}

function onTransition(oldStatus, status) {
    if (status === 'opened') {
        console.log('compat server opened at', this.url.href);
    } else if (status === 'closed') {
        console.log('compat server closed');
    }
}
function requestHandler(nodeRequest, nodeResponse) {
    var request = createRequestFromNodeRequest(nodeRequest, this.url);
    console.log(request.method, request.url.toString());
    // console.log('myRest base url', myRest.baseUrl.toString());
    // console.log('httpRequest url', httpRequest.url);
    // console.log('request url', request.url.toString());

    myRest.fetch(request).then(function(response) {
        syncNodeResponseAndResponse(response, nodeResponse);
    }).catch(function(e) {
        console.log(500, e.stack);
        nodeResponse.writeHead(500, corsHeaders);
        nodeResponse.end(e ? e.stack : '');
    });
}

const server = Server.create();
server.requestHandler = requestHandler;
server.onTransition = onTransition;
server.use = myRest.use.bind(myRest);
server.serveFile = function(options) {
    server.use(createFileService(options));
};
server.createHTMLResponse = html => {
    return {
        status: 200,
        headers: {
            'content-type': 'text/html',
            'content-length': Buffer.byteLength(html)
        },
        body: html
    };
};
server.createJSResponse = js => {
    return {
        status: 200,
        headers: {
            'content-type': 'application/javascript',
            'content-length': Buffer.byteLength(js)
        },
        body: js
    };
};
// server.redirect = fn => {
//     server.use({
//         match(request) {
//             const redirection = fn(request);
//             if (redirection) {
//                 request.url = request.url.resolve(redirection);
//             }
//         }
//     });
// };

export default server;