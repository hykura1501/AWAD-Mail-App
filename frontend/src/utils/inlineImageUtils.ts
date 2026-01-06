/**
 * Inline Image Processing Utilities
 * 
 * Handles conversion of inline images for email forwarding/replying.
 * Uses RFC 2387 compliant CID (Content-ID) approach for proper
 * rendering in email clients like Gmail.
 */

import { API_BASE_URL } from "@/config/api";
import { getAccessToken } from "@/lib/api-client";
import type { Attachment } from "@/types/email";

/**
 * Represents an inline image with its Content-ID for email embedding
 */
export interface InlineImage {
  file: File;
  contentId: string;
}

/**
 * Result of processing inline images from HTML content
 */
export interface ProcessedInlineImages {
  /** HTML with API URLs replaced by cid: references */
  processedHtml: string;
  /** Inline images extracted from the content */
  inlineImages: InlineImage[];
}

/**
 * Download an attachment and return as InlineImage with content_id
 * 
 * @param emailId - Original email ID
 * @param attachment - Attachment metadata with content_id
 * @returns InlineImage object with file and contentId
 */
export async function downloadInlineImage(
  emailId: string,
  attachment: Attachment
): Promise<InlineImage | null> {
  if (!attachment.content_id) return null;

  const token = getAccessToken();
  const url = `${API_BASE_URL}/emails/${emailId}/attachments/${attachment.id}?token=${token}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to download inline image: ${attachment.name}`);
      return null;
    }

    const blob = await response.blob();
    const file = new File([blob], attachment.name, { type: attachment.mime_type });

    return {
      file,
      contentId: attachment.content_id,
    };
  } catch (error) {
    console.error(`Error downloading inline image: ${attachment.name}`, error);
    return null;
  }
}

/**
 * Download all inline images from attachments
 * 
 * @param emailId - Original email ID
 * @param attachments - Attachments to download
 * @returns Array of InlineImage objects
 */
export async function downloadAllInlineImages(
  emailId: string,
  attachments: Attachment[]
): Promise<InlineImage[]> {
  const inlineAttachments = attachments.filter((a) => a.content_id);
  
  const results = await Promise.allSettled(
    inlineAttachments.map((attachment) => downloadInlineImage(emailId, attachment))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<InlineImage | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((img): img is InlineImage => img !== null);
}

/**
 * Extract regular attachments (non-inline) from attachments list
 */
export function getRegularAttachments(attachments: Attachment[]): Attachment[] {
  return attachments.filter((a) => !a.content_id);
}

/**
 * Replace API URLs in HTML with cid: references
 * 
 * This scans the HTML for img tags pointing to our API and replaces
 * them with proper cid: references that email clients understand.
 * 
 * @param html - HTML content with API URLs
 * @param emailId - Original email ID (to match URLs)
 * @param attachments - Attachments with content_id info
 * @returns Processed HTML with cid: references
 */
export function replaceApiUrlsWithCid(
  html: string,
  emailId: string,
  attachments: Attachment[]
): string {
  let processedHtml = html;

  attachments.forEach((attachment) => {
    if (attachment.content_id) {
      // Match API URL pattern for this attachment
      const urlPattern = new RegExp(
        `${API_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/emails/${emailId}/attachments/${attachment.id}[^"]*`,
        'g'
      );
      
      // Replace with cid: reference
      processedHtml = processedHtml.replace(urlPattern, `cid:${attachment.content_id}`);
    }
  });

  return processedHtml;
}

/**
 * Check if HTML contains any inline images pointing to our API
 */
export function hasInlineApiImages(html: string): boolean {
  return html.includes(API_BASE_URL) && html.includes('/attachments/');
}
