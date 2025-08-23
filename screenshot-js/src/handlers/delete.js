/**
 * Screenshot delete handler
 */

/**
 * Handle screenshot delete requests
 * @param {object} screenshotStorage - Screenshot storage instance
 * @param {object} args - Delete arguments
 * @returns {Promise<object>} Delete result
 */
export async function handleDelete(screenshotStorage, args = {}) {
  try {
    const {
      filename = null,
      filenames = null,
      olderThanDays = null
    } = args;

    let results = {
      deleted: [],
      failed: []
    };

    if (olderThanDays !== null) {
      // Delete screenshots older than specified days
      if (typeof olderThanDays !== 'number' || olderThanDays < 0) {
        throw new Error('olderThanDays must be a non-negative number');
      }

      results = await deleteOlderThan(screenshotStorage, olderThanDays);
      
    } else if (filenames && Array.isArray(filenames)) {
      // Delete multiple screenshots
      if (filenames.length === 0) {
        throw new Error('filenames array cannot be empty');
      }

      if (filenames.length > 50) {
        throw new Error('Cannot delete more than 50 files at once');
      }

      // Validate filenames
      for (const fname of filenames) {
        if (typeof fname !== 'string' || fname.trim().length === 0) {
          throw new Error('All filenames must be non-empty strings');
        }
        if (fname.includes('..') || fname.includes('/') || fname.includes('\\')) {
          throw new Error(`Invalid filename: ${fname}`);
        }
      }

      results = await screenshotStorage.deleteMultiple(filenames);

    } else if (filename) {
      // Delete single screenshot
      if (typeof filename !== 'string' || filename.trim().length === 0) {
        throw new Error('Filename must be a non-empty string');
      }

      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new Error('Invalid filename');
      }

      try {
        await screenshotStorage.deleteScreenshot(filename);
        results.deleted.push(filename);
      } catch (error) {
        results.failed.push({ filename, error: error.message });
      }

    } else {
      throw new Error('Must specify filename, filenames array, or olderThanDays');
    }

    const response = {
      success: true,
      operation: 'delete',
      results: {
        deleted: results.deleted,
        deletedCount: results.deleted.length,
        failed: results.failed,
        failedCount: results.failed.length
      },
      message: `Successfully deleted ${results.deleted.length} screenshot(s)${
        results.failed.length > 0 ? `, failed to delete ${results.failed.length}` : ''
      }`
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };

  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            operation: 'delete',
            error: error.message,
            timestamp: new Date().toISOString()
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Delete screenshots older than specified days
 * @param {object} screenshotStorage - Screenshot storage instance
 * @param {number} days - Number of days
 * @returns {Promise<object>} Delete results
 */
async function deleteOlderThan(screenshotStorage, days) {
  const screenshots = await screenshotStorage.listScreenshots({ limit: 1000 });
  const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
  
  const toDelete = screenshots
    .filter(screenshot => new Date(screenshot.created) < cutoffDate)
    .map(screenshot => screenshot.filename);

  if (toDelete.length === 0) {
    return { deleted: [], failed: [] };
  }

  return await screenshotStorage.deleteMultiple(toDelete);
}