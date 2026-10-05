"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classify = classify;
const CHEAP = new Set([
    'ok',
    'okay',
    'yes',
    'no',
    'thanks',
    'thank you',
    'k',
    'lol',
    'yep',
    'nope',
    'sure',
]);
function classify(text) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.endsWith('?'))
        return 'ask';
    const key = trimmed.toLowerCase().replace(/[.!]+$/g, '');
    if (CHEAP.has(key))
        return 'cheap';
    return 'escalate';
}
