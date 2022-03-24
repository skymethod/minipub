import { assertStrictEquals } from 'https://deno.land/std@0.131.0/testing/asserts.ts';
import { computeCreateUser } from '../rpc/create_user.ts';
import { CreateUserRequest } from '../rpc_model.ts';
import { isValidUuid } from '../uuid.ts';
import { makeSqliteStorage } from '../sqlite_storage.ts';
import { computeBlob } from './blob_endpoint.ts';
import { Bytes } from '../deps.ts';
import { IMAGE_PNG } from '../media_types.ts';

Deno.test('computeBlob', async () => {
    const bytesBase64 = Bytes.ofUtf8('PNG').base64();
    const req: CreateUserRequest = {
        kind: 'create-user',
        username: 'alice',
        icon: {
            bytesBase64,
            size: 1,
            mediaType: IMAGE_PNG,
        }
    };
    const storage = makeSqliteStorage();
    const { actorUuid, blobReferences } = await computeCreateUser(req, 'https://example.social', storage);
    assertStrictEquals(isValidUuid(actorUuid), true);
    const [ blobUuid ] = Object.entries(blobReferences).find(v => v[1].tag === 'icon') || [];
    if (!blobUuid ) throw new Error('icon not found');

    const res = await computeBlob(actorUuid, blobUuid, 'png', storage);
    assertStrictEquals(res.status, 200);
    assertStrictEquals(res.headers.get('content-type'), IMAGE_PNG);
    const b64 = new Bytes(new Uint8Array(await res.arrayBuffer())).base64();
    assertStrictEquals(b64, bytesBase64);
});
