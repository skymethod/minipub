export function newUuid(): string {
    return crypto.randomUUID().toLowerCase().replaceAll('-', '');
}

export function isValidUuid(uuid: string) {
    return /^[0-9a-f]{12}4[0-9a-f]{19}$/.test(uuid);
}
