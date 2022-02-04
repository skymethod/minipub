Threadcap helps you take and update snapshots of a public ActivityPub comment thread, given a root post url.

A [Minipub](https://minipub.dev) subproject.

Carefully packaged so that it can be used from either newer-style ESM-based or older-style CommonJS-based Node projects.

## Usage in an ESM-based Node project

You'll need a fetch implementation: 
```sh
npm install node-fetch
```

`example.mjs`
```js
import { makeThreadcap, InMemoryCache, updateThreadcap, makeRateLimitedFetcher } from 'threadcap';
import fetch from 'node-fetch';

const userAgent = 'my-podcast-app/1.0';
const cache = new InMemoryCache();
const fetcher = makeRateLimitedFetcher(fetch); // respect any rate-limits defined by remote hosts

// initialize the threadcap
const threadcap = await makeThreadcap('https://example.social/users/alice/statuses/123456123456123456', { userAgent, cache, fetcher });

// update the threadcap, process all replies
const callbacks = {
    onEvent: e => {
        if (e.kind === 'node-processed' && e.part === 'comment') {
            console.log(`Processed ${e.nodeId}`);
            // threadcap is now updated with a new comment, update your UI incrementally
        }
    }
}
await updateThreadcap(threadcap, { updateTime: new Date().toISOString(), userAgent, fetcher, cache, fetcher, callbacks });

// final threadcap includes the comment/commenter info for the root post and all replies
console.log(JSON.stringify(threadcap, undefined, 2));
```

## Usage in a CommonJS-based Node project

You'll need a commonjs-based fetch implementation: 
```sh
npm install node-fetch@2
```

`example.js`
```js
const { makeThreadcap, InMemoryCache, updateThreadcap, makeRateLimitedFetcher } = require('threadcap');
const fetch = require('node-fetch');

async function run() {
    const userAgent = 'my-podcast-app/1.0';
    const cache = new InMemoryCache();
    const fetcher = makeRateLimitedFetcher(fetch); // respect any rate-limits defined by remote hosts

    // initialize the threadcap
    const threadcap = await makeThreadcap('https://example.social/users/alice/statuses/123456123456123456', { userAgent, cache, fetcher });

    // update the threadcap, process all replies
    const callbacks = {
        onEvent: e => {
            if (e.kind === 'node-processed' && e.part === 'comment') {
                console.log(`Processed ${e.nodeId}`);
                // threadcap is now updated with a new comment, update your UI incrementally
            }
        }
    }
    await updateThreadcap(threadcap, { updateTime: new Date().toISOString(), userAgent, fetcher, cache, fetcher, callbacks });

    // final threadcap includes the comment/commenter info for the root post and all replies
    console.log(JSON.stringify(threadcap, undefined, 2));
}

run(); // no top-level await when using CommonJS

```