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
import { makeThreadcap, InMemoryCache, updateThreadcap, makeRateLimitedFetcher, Callbacks } from 'https://raw.githubusercontent.com/skymethod/minipub/v0.1.5/src/threadcap/threadcap.ts';

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

## Example threadcap JSON structure

Typescript type is fully documented in [threadcap.ts](https://github.com/skymethod/minipub/blob/master/src/threadcap/threadcap.ts#L4) to appear in IDEs, but here is a realistic example output JSON
with the same documentation:

```jsonc
// threadcap: Snapshot of an ActivityPub thread tree, starting at a given root object url.
// Serializable json object that can be saved, then reloaded to resume or update.
// Create a new threadcap using the 'makeThreadcap' function.
// Update an existing threadcap using the 'updateThreadcap' function.
{
  // ActivityPub id of the root object url.
  // Use this to lookup the corresponding root Node in the 'nodes' property when starting to recurse down a reply tree.
  "root": "https://example.social/users/alice/statuses/107939417586098696",

  // Comment data nodes captured so far, keyed by ActivityPub id.
  // Each Node has information on any comment content or error found, and pointers to its direct replies or error found.
  "nodes": {
    "https://example.social/users/alice/statuses/107939417586098696": {

      // Inline comment info, enough to render the comment itself (no replies).
      "comment": {

        // Public web link to this comment, if available.
        "url": "https://example.social/@alice/107939417586098696",

        // Time this comment was published.
        // Value comes directly from the ActivityPub payload, which is usually ISO-8601.
        "published": "2022-03-11T18:53:24Z",

        // Media attachments included in this comment, if any.
        "attachments": [
          {
            // Mime type of the attachment.
            "mediaType": "image/jpeg", 

            // Width of the attachment image or video, if applicable.
            "width": 1024,

            // Height of the attachment image or video, if applicable.
            "height": 1024,

            // Source url to the attachment image or video.
            "url": "https://example.social/content/media_attachments/files/107/939/417/463/353/610/original/efbc7e05930e670a.jpeg"
          }
        ],

        // Content (which may include html) for this comment, broken out by language code.
        // ActivityPub technically supports multiple translations of a single post, though most servers will capture only one in their user interface.
        // A language code of `und` indicates the server did not specify a language.
        "content": {
          "en": "<p>Comment! 🎉🍻🎙</p>"
        },

        // ActivityPub id to the Person (or Service) actor that is responsible for this comment.
        // Look up the full Commenter info using 'commenters', with this value as the index.
        "attributedTo": "https://example.social/users/alice"
      },

      // Time when the comment info or error was updated.
      "commentAsof": "2022-03-12T16:52:03.948Z",

      // ActivityPub ids of the direct child replies, once found completely.
      // Use these to lookup the corresponding nodes when recursing down a reply tree.
      // An empty array indicates no child replies were found, `undefined` means they have yet to be fetched, or failed to fetch.
      "replies": [
        "https://example.social/users/Bob/statuses/107939427682302143",
        "https://example.social/users/Carlos/statuses/107939930600043817",
        "https://example.social/users/Dan/statuses/107939988318438193"
      ],

      // Time when the replies info or error was updated.
      "repliesAsof": "2022-03-12T16:52:03.948Z"
    },
    "https://example.social/users/Bob/statuses/107939427682302143": {
      "comment": {
        "url": "https://example.social/@Bob/107939427682302143",
        "published": "2022-03-11T18:55:58Z",
        "attachments": [],
        "content": {
          "en": "<p>Comment!</p>"
        },
        "attributedTo": "https://example.social/users/Bob"
      },
      "commentAsof": "2022-03-12T16:52:03.948Z",

      // Error encountered when trying to fetch and parse the direct child replies.
      // Either 'replies' or 'repliesError' will be defined, never both.
      "repliesError": "Failed to enumerate replies!",

      "repliesAsof": "2022-03-12T16:52:03.948Z"
    },
    "https://example.social/users/Carlos/statuses/107939930600043817": {
      "comment": {
        "url": "https://example.social/@Carlos/107939930600043817",
        "published": "2022-03-11T21:03:52Z",
        "attachments": [],
        "content": {
          "en": "<p>Comment!</p>"
        },
        "attributedTo": "https://example.social/users/Carlos"
      },
      "commentAsof": "2022-03-12T16:52:03.948Z",
      "replies": [
        "https://example.social/users/alice/statuses/107940172190413796"
      ],
      "repliesAsof": "2022-03-12T16:52:03.948Z"
    },
    "https://example.social/users/Dan/statuses/107939988318438193": {
      "comment": {
        "url": "https://example.social/@Dan/107939988318438193",
        "published": "2022-03-11T21:18:33Z",
        "attachments": [],
        "content": {
          "en": "<p>Comment!</p>"
        },
        "attributedTo": "https://example.social/users/Dan"
      },
      "commentAsof": "2022-03-12T16:52:03.948Z",
      "replies": [
        "https://example.social/users/alice/statuses/107940180378482688"
      ],
      "repliesAsof": "2022-03-12T16:52:03.948Z"
    },
    "https://example.social/users/alice/statuses/107940172190413796": {
      "comment": {
        "url": "https://example.social/@alice/107940172190413796",
        "published": "2022-03-11T22:05:18Z",
        "attachments": [],
        "content": {
          "en": "<p>Comment!</p>"
        },
        "attributedTo": "https://example.social/users/alice"
      },
      "commentAsof": "2022-03-12T16:52:03.948Z",
      "replies": [
        "https://example.social/users/Carlos/statuses/107940214277865378"
      ],
      "repliesAsof": "2022-03-12T16:52:03.948Z"
    },
    "https://example.social/users/alice/statuses/107940180378482688": {

      // Error encountered when trying to fetch and parse this comment info.
      // Either 'comment' or 'commentError' will be defined, never both.
      "commentError": "Failed to fetch!",

      "commentAsof": "2022-03-12T16:52:03.948Z",
      "replies": [],
      "repliesAsof": "2022-03-12T16:52:03.948Z"
    },
    "https://example.social/users/Carlos/statuses/107940214277865378": {
      "comment": {
        "url": "https://example.social/@Carlos/107940214277865378",
        "published": "2022-03-11T22:16:01Z",
        "attachments": [],
        "content": {
          "en": "<p>Comment!</p>"
        },
        "attributedTo": "https://example.social/users/Carlos"
      },
      "commentAsof": "2022-03-12T16:52:03.948Z",
      "replies": [
        "https://anotherexample.space/objects/87b74fb9-913d-4a9b-9444-72e2a87ec540"
      ],
      "repliesAsof": "2022-03-12T16:52:03.948Z"
    },
    "https://anotherexample.space/objects/87b74fb9-913d-4a9b-9444-72e2a87ec540": {
      "comment": {
        "url": "https://anotherexample.space/objects/87b74fb9-913d-4a9b-9444-72e2a87ec540",
        "published": "2022-03-11T23:51:36.011246Z",
        "attachments": [],
        "content": {
          "und": "<p>Comment!</p>"
        },
        "attributedTo": "https://anotherexample.space/users/eve"
      },
      "commentAsof": "2022-03-12T16:52:03.948Z",
      "replies": [],
      "repliesAsof": "2022-03-12T16:52:03.948Z"
    }
  },

  // Information about each Commenter captured so far, keyed by ActivityPub id (e.g the Comment 'attributedTo')
  // Kept here, outside of 'nodes', to minimize data duplication if a reply tree has multiple comments from the same commenter.
  // In general, you can assume that all Comment 'attributedTo' references inside 'nodes' have corresponding referents here. 
  "commenters": {
    "https://example.social/users/alice": {
      // Profile icon for the commenter, if any
      "icon": {

        // Source url to the icon image.
        "url": "https://example.social/content/accounts/avatars/000/000/269/original/4870123c3ae92a44.jpg",

        // Mime type of the icon image, if known.
        "mediaType": "image/jpeg"
      },

      // Display name of the commenter.
      "name": "Alice Doe",

      // Web link to the commenter profile.
      "url": "https://example.social/@alice",

      // Fully-qualified fediverse username, e.g. @user@example.com
      "fqUsername": "@alice@example.social",

      // Time this information was last fetched
      "asof": "2022-03-12T16:52:03.948Z"
    },
    "https://example.social/users/Bob": {
      "icon": {
        "url": "https://example.social/content/accounts/avatars/106/557/219/416/316/803/original/c65012321a9d4807.png",
        "mediaType": "image/png"
      },
      "name": "Bob Doe",
      "url": "https://example.social/@Bob",
      "fqUsername": "@Bob@example.social",
      "asof": "2022-03-12T16:52:03.948Z"
    },
    "https://example.social/users/Carlos": {
      "icon": {
        "url": "https://example.social/content/accounts/avatars/106/533/207/812/918/186/original/fa83123dbc94380b.png",
        "mediaType": "image/png"
      },
      "name": "Carlos Doe",
      "url": "https://example.social/@Carlos",
      "fqUsername": "@Carlos@example.social",
      "asof": "2022-03-12T16:52:03.948Z"
    },
    "https://example.social/users/Dan": {
      "icon": {
        "url": "https://example.social/content/accounts/avatars/000/015/466/original/1dcbcd12319f90a7.png",
        "mediaType": "image/png"
      },
      "name": "Dan Doe",
      "url": "https://example.social/@Dan",
      "fqUsername": "@Dan@example.social",
      "asof": "2022-03-12T16:52:03.948Z"
    },
    "https://anotherexample.space/users/eve": {
      "icon": {
        "url": "https://anotherexample.space/media/ef0e3ca3a78c9cb2912338d3c476344b90358f497b3543ca1fe9c785b4ccdf62.jpg?name=blob.jpg"
      },
      "name": "Eve Doe",
      "url": "https://anotherexample.space/users/eve",
      "fqUsername": "eve@anotherexample.space",
      "asof": "2022-03-12T16:52:03.948Z"
    }
  }
}
```