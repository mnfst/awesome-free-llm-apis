import type { Message } from '../providers/types.js';

/**
 * Safely extracts text content from a Message, handling both string and multi-modal (array) content.
 */
/**
 * Safely extracts text content from a Message or raw content, handling strings, multi-modal (array) content, and structured objects.
 */
export function getMessageContent(input: any): string {
    if (input === undefined || input === null) return '';

    // Handle full Message object
    let content = input;
    if (typeof input === 'object' && 'content' in input && input.content !== undefined) {
        content = input.content;
    }

    if (content === undefined || content === null) return '';
    
    // 1. String content
    if (typeof content === 'string') return content;
    
    // 2. Array-based multi-modal content
    if (Array.isArray(content)) {
        return content
            .map((part: any) => {
                if (typeof part === 'string') return part;
                if (part && typeof part === 'object') {
                    return part.text || part.task || part.content || '';
                }
                return String(part);
            })
            .filter(Boolean)
            .join(' ');
    }
    
    // 3. Single-object content (some models/parsers return this)
    if (typeof content === 'object') {
        return content.text || content.task || content.content || JSON.stringify(content);
    }
    
    return String(content);
}

/**
 * Safely prepends a string to a message's content, preserving multi-modal structure if present.
 */
export function prependToMessageContent(msg: any, prefix: string): void {
    if (!prefix) return;
    
    if (typeof msg.content === 'string') {
        msg.content = (prefix + (msg.content || '')).trim();
    } else if (Array.isArray(msg.content)) {
        // If it's an array, prepend a text part
        msg.content = [{ type: 'text', text: prefix }, ...msg.content];
    } else if (msg.content && typeof msg.content === 'object') {
        // If it's a single object, convert to array or wrap
        if ('text' in msg.content) {
            msg.content.text = prefix + msg.content.text;
        } else {
            msg.content = [
                { type: 'text', text: prefix },
                msg.content
            ];
        }
    } else {
        // Fallback for null/undefined or other types
        msg.content = prefix + (msg.content ? String(msg.content) : '');
    }
}

/**
 * Safely appends a string to a message's content, preserving multi-modal structure if present.
 */
export function appendToMessageContent(msg: any, suffix: string): void {
    if (!suffix) return;
    
    if (typeof msg.content === 'string') {
        msg.content = ((msg.content || '') + suffix).trim();
    } else if (Array.isArray(msg.content)) {
        msg.content = [...msg.content, { type: 'text', text: suffix }];
    } else if (msg.content && typeof msg.content === 'object') {
        if ('text' in msg.content) {
            msg.content.text = msg.content.text + suffix;
        } else {
            msg.content = [
                msg.content,
                { type: 'text', text: suffix }
            ];
        }
    } else {
        msg.content = (msg.content ? String(msg.content) : '') + suffix;
    }
}

