Threadcap helps you take and update snapshots of a public ActivityPub comment thread, given a root post url.

A [Minipub](https://minipub.dev) subproject.

Carefully packaged so that it can be used from either newer-style ESM-based or older-style CommonJS-based Node projects.

Written using Deno, so also can be used without this NPM package at all (see Deno example below).

## Features
- Isomorphic, use in the browser, Node, or Deno
- No dependencies, bring your own fetch
- TypeScript typings included
- Produces a threadcap: a serializable json object snapshot of the comment thread, includes normalized comment/commenter/attachment info along with any errors encountered during enumeration
- Supports incremental updating scenarios
- Bring your own caching to control which nodes are refetched
- Can specify a maximum level of nodes to update in one pass
- Breadth-first update, can specify a maximum number of levels to update in one pass
- Can specify a subnode out of the larger reply tree to refresh
- Tested with Mastodon, PeerTube, Castopod, and others
- Tested with Pleroma, but replies under any Pleroma comment node will always be empty (since Pleroma does not implement the ActivityPub `replies` property)
- Internal comment fetching respects rate-limit headers coming back from remote hosts (can also define a custom wait function)
- Callback events for interesting events that occur while updating the threadcap

## Documentation
See the API docs in [threadcap.ts](https://github.com/skymethod/minipub/blob/master/src/threadcap/threadcap.ts) for now. 

These are also used to generate TypeScript typings for this NPM package, so you'll get them as hover documentation in your IDE.

## Example usage in an ESM-based Node project

Installation:
```sh
npm install threadcap
npm install node-fetch # you'll need a fetch implementation
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
await updateThreadcap(threadcap, { updateTime: new Date().toISOString(), userAgent, cache, fetcher, callbacks });

// final threadcap includes the comment/commenter info for the root post and all replies
console.log(JSON.stringify(threadcap, undefined, 2));
```

## Example usage in a CommonJS-based Node project

Installation:
```sh
npm install threadcap
npm install node-fetch@2 # you'll need a commonjs-based fetch implementation
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
    await updateThreadcap(threadcap, { updateTime: new Date().toISOString(), userAgent, cache, fetcher, callbacks });

    // final threadcap includes the comment/commenter info for the root post and all replies
    console.log(JSON.stringify(threadcap, undefined, 2));
}

run(); // no top-level await when using CommonJS

```

## Example usage in a [Deno](https://deno.land) project
You don't need this NPM package or to install anything, just remote-import `threadcap.ts` from the source repo

`example.ts`
```ts
import { makeThreadcap, InMemoryCache, updateThreadcap, makeRateLimitedFetcher, Callbacks } from 'https://raw.githubusercontent.com/skymethod/minipub/v0.1.4/src/threadcap/threadcap.ts';

const userAgent = 'my-podcast-app/1.0';
const cache = new InMemoryCache();
const fetcher = makeRateLimitedFetcher(fetch); // respect any rate-limits defined by remote hosts

// initialize the threadcap
const threadcap = await makeThreadcap('https://example.social/users/alice/statuses/123456123456123456', { userAgent, cache, fetcher }); 

// update the threadcap, process all replies
const callbacks: Callbacks = {
    onEvent: e => {
        if (e.kind === 'node-processed' && e.part === 'comment') {
            console.log(`Processed ${e.nodeId}`);
            // threadcap is now updated with a new comment, update your UI incrementally
        }
    }
}
await updateThreadcap(threadcap, { updateTime: new Date().toISOString(), userAgent, cache, fetcher, callbacks });

// final threadcap includes the comment/commenter info for the root post and all replies
console.log(JSON.stringify(threadcap, undefined, 2));
```
