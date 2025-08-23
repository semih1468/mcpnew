/**
 * Screenshot view handler
 */

/**
 * Handle screenshot view requests
 * @param {object} screenshotStorage - Screenshot storage instance
 * @param {object} args - View arguments
 * @returns {Promise<object>} View result
 */
export async function handleView(screenshotStorage, args = {}) {
  try {
    const {
      filename = null,
      latest = false
    } = args;

    let screenshot;

    if (latest || !filename) {
      // Get latest screenshot
      try {
        screenshot = await screenshotStorage.getLatestScreenshot();
      } catch (error) {
        throw new Error('No screenshots found');
      }
    } else {
      // Get specific screenshot
      if (typeof filename !== 'string' || filename.trim().length === 0) {
        throw new Error('Filename must be a non-empty string');
      }

      // Validate filename (basic security check)
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new Error('Invalid filename');
      }

      try {
        screenshot = await screenshotStorage.getScreenshot(filename);
      } catch (error) {
        throw new Error(`Screenshot not found: ${filename}`);
      }
    }

    const response = {
      success: true,
      operation: 'view',
      screenshot: {
        filename: screenshot.filename,
        size: screenshot.size,
        sizeFormatted: screenshot.sizeFormatted,
        created: screenshot.created,
        modified: screenshot.modified,
        age: getRelativeTime(screenshot.created)
      },
      // Include base64 data for Claude to analyze
      base64: screenshot.base64,
      contentType: `image/${getImageFormat(screenshot.filename)}`,
      message: `Screenshot ${screenshot.filename} retrieved successfully`
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            operation: 'view',
            screenshot: response.screenshot,
            message: response.message,
            note: 'Base64 image data available for analysis'
          }, null, 2),
        },
      ],
      // Provide base64 as additional metadata for Claude to use
      _meta: {
        base64: screenshot.base64,
        contentType: response.contentType,
        filename: screenshot.filename
      }
    };

  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            operation: 'view',
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

/**
 * Get image format from filename
 * @param {string} filename - Filename
 * @returns {string} Image format
 */
function getImageFormat(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'jpeg';
    case 'png':
      return 'png';
    case 'gif':
      return 'gif';
    case 'bmp':
      return 'bmp';
    default:
      return 'png';
  }
}