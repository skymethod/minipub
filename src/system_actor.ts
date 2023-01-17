export type JsonResponse = { contentType: string, body: Record<string, unknown> }

export const computeWebfingerSubject = ({ origin, actorUsername }: { origin: string, actorUsername: string }) => `acct:${actorUsername}@${new URL(origin).host}`;

export const computeWebfingerResponse = ({ origin, actorUsername, actorPathname }: { origin: string, actorUsername: string, actorPathname: string }): JsonResponse => ({ 
    contentType: 'application/jrd+json; charset=utf-8',
    body: {
        subject: computeWebfingerSubject({ origin, actorUsername }),
        aliases: [`${origin}${actorPathname}`],
        links: [
            { 'rel': 'self', 'type': 'application/activity+json', 'href': `${origin}${actorPathname}` }
        ]
    },
});

export const computeSystemActorResponse = ({ origin, actorUsername, actorPathname, url, publicKeyPem }: { origin: string, actorUsername: string, actorPathname: string, url: string, publicKeyPem: string }): JsonResponse => ({
    contentType: 'application/activity+json; charset=utf-8',
    body: {
        '@context': [
            'https://www.w3.org/ns/activitystreams', 
            'https://w3id.org/security/v1', 
            { 
                'manuallyApprovesFollowers': 'as:manuallyApprovesFollowers', 
                'toot': 'http://joinmastodon.org/ns#', 
                'featured': { '@id': 'toot:featured', '@type': '@id' }, 
                'featuredTags': { '@id': 'toot:featuredTags', '@type': '@id' }, 
                'alsoKnownAs': { '@id': 'as:alsoKnownAs', '@type': '@id' }, 
                'movedTo': { '@id': 'as:movedTo', '@type': '@id' }, 
                'schema': 'http://schema.org#', 
                'PropertyValue': 'schema:PropertyValue', 
                'value': 'schema:value', 
                'discoverable': 'toot:discoverable', 
                'Device': 'toot:Device', 
                'Ed25519Signature': 'toot:Ed25519Signature', 
                'Ed25519Key': 'toot:Ed25519Key', 
                'Curve25519Key': 'toot:Curve25519Key', 
                'EncryptedMessage': 'toot:EncryptedMessage', 
                'publicKeyBase64': 'toot:publicKeyBase64', 
                'deviceId': 'toot:deviceId', 
                'claim': { '@type': '@id', '@id': 'toot:claim' }, 
                'fingerprintKey': { '@type': '@id', '@id': 'toot:fingerprintKey' }, 
                'identityKey': { '@type': '@id', '@id': 'toot:identityKey' }, 
                'devices': { '@type': '@id', '@id': 'toot:devices' }, 
                'messageFranking': 'toot:messageFranking', 
                'messageType': 'toot:messageType', 
                'cipherText': 'toot:cipherText', 
                'suspended': 'toot:suspended' 
            }
        ], 
        id: `${origin}${actorPathname}`, 
        type: 'Application', 
        inbox: `${origin}${actorPathname}/inbox`, // required, but never called
        preferredUsername: actorUsername,
        url,
        manuallyApprovesFollowers: true, 
        publicKey: { 
            id: `${origin}${actorPathname}#main-key`, 
            owner: `${origin}${actorPathname}`, 
            publicKeyPem,
        }, 
    }
});
