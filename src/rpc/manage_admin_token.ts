import { encodeAscii85 } from '../deps.ts';
import { GenerateAdminTokenRequest, GenerateAdminTokenResponse, RevokeAdminTokenRequest, RevokeAdminTokenResponse, ValidateAdminTokenRequest, ValidateAdminTokenResponse } from '../rpc_model.ts';
import { BackendStorage, getRecord } from '../storage.ts';

export async function computeGenerateAdminToken(_req: GenerateAdminTokenRequest, storage: BackendStorage): Promise<GenerateAdminTokenResponse> {
    const created = new Date().toISOString();
    const token = generateToken();
    await storage.transaction(async txn => await txn.put('token', 'admin', { token, created }));
    return { kind: 'generate-admin-token', token };
}

export async function computeRevokeAdminToken(_req: RevokeAdminTokenRequest, storage: BackendStorage): Promise<RevokeAdminTokenResponse> {
    const existed = await storage.transaction(async txn => await txn.delete('token', 'admin'));
    return { kind: 'revoke-admin-token', existed };
}

export async function computeValidateAdminToken(req: ValidateAdminTokenRequest, storage: BackendStorage): Promise<ValidateAdminTokenResponse> {
    const { token } = await storage.transaction(async txn => await getRecord(txn, 'token', 'admin')) || {};
    const valid = req.token === token;
    return { kind: 'validate-admin-token', valid };
}

//

function generateToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return encodeAscii85(bytes, { standard: 'Z85' });
}
