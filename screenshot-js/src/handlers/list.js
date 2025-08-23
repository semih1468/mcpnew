/**
 * Screenshot list handler
 */

/**
 * Handle screenshot list requests
 * @param {object} screenshotStorage - Screenshot storage instance
 * @param {object} args - List arguments
 * @returns {Promise<object>} List result
 */
export async function handleList(screenshotStorage, args = {}) {
  try {
    const {
      limit = 20,
      sortBy = 'created',
      order = 'desc'
    } = args;

    // Validate arguments
    if (typeof limit !== 'number' || limit <= 0) {
      throw new Error('Limit must be a positive number');
    }

    if (limit > 100) {
      throw new Error('Limit cannot exceed 100');
    }

    if (!['created', 'modified', 'size', 'filename'].includes(sortBy)) {
      throw new Error('sortBy must be one of: created, modified, size, filename');
    }

    if (!['asc', 'desc'].includes(order)) {
      throw new Error('order must be asc or desc');
    }

    // Get screenshots list
    const screenshots = await screenshotStorage.listScreenshots({
      limit,
      sortBy,
      order
    });

    // Get storage statistics
    const storageStats = await screenshotStorage.getStorageStats();

    const response = {
      success: true,
      operation: 'list',
      screenshots: screenshots.map(screenshot => ({
        filename: screenshot.filename,
        size: screenshot.size,
        sizeFormatted: screenshot.sizeFormatted,
        created: screenshot.created,
        modified: screenshot.modified,
        age: getRelativeTime(screenshot.created)
      })),
      count: screenshots.length,
      pagination: {
        limit,
        sortBy,
        order,
        hasMore: screenshots.length === limit
      },
      storage: {
        totalFiles: storageStats.totalFiles,
        totalSize: storageStats.totalSizeFormatted,
        utilizationPercent: storageStats.utilizationPercent
      }
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
            operation: 'list',
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
 * Get relative time string
 * @param {Date} date - Date to compare
 * @returns {string} Relative time string
 */
function getRelativeTime(date) {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  } else {
    return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
  }
}