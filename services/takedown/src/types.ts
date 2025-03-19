/**
 * Request format for the takedown service
 */
export interface TakedownRequest {
  /**
   * Array of artist IDs to process
   */
  artistId: string[];
}
