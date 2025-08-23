/**
 * Screenshot capture utility with auto-capture functionality
 */

import screenshot from 'screenshot-desktop';
import sharp from 'sharp';
import { logger, operationLogger } from './logger.js';
import { screenshotStorage } from './storage.js';

export class Screenshotter {
  constructor() {
    this.autoCapture = {
      enabled: false,
      interval: null,
      timer: null
    };
    this.defaultOptions = {
      format: process.env.SCREENSHOT_FORMAT || 'png',
      quality: parseInt(process.env.SCREENSHOT_QUALITY) || 90,
      monitor: parseInt(process.env.DEFAULT_MONITOR) || 0
    };
  }

  /**
   * Initialize screenshotter
   */
  async initialize() {
    try {
      await screenshotStorage.initialize();
      logger.info('Screenshotter initialized');

      // Start auto capture if enabled in environment
      if (process.env.AUTO_CAPTURE_ENABLED === 'true') {
        const interval = parseInt(process.env.AUTO_CAPTURE_INTERVAL) || 30000;
        await this.startAutoCapture(interval);
      }
    } catch (error) {
      logger.error('Failed to initialize screenshotter', { error: error.message });
      throw error;
    }
  }

  /**
   * Take a screenshot
   * @param {object} options - Screenshot options
   * @returns {Promise<object>} Screenshot result
   */
  async capture(options = {}) {
    const startTime = Date.now();
    const operationId = operationLogger.logOperation({
      operation: 'CAPTURE',
      success: false,
      executionTime: 0
    });

    try {
      const {
        monitor = this.defaultOptions.monitor,
        format = this.defaultOptions.format,
        quality = this.defaultOptions.quality,
        saveToFile = true,
        filename = null,
        area = null // { x, y, width, height }
      } = options;

      logger.debug('Starting screenshot capture', {
        monitor,
        format,
        quality,
        saveToFile,
        area
      });

      // Get available displays first
      const displays = await this.getDisplays();
      
      if (monitor >= displays.length) {
        throw new Error(`Monitor ${monitor} not found. Available monitors: 0-${displays.length - 1}`);
      }

      // Capture screenshot
      let imageBuffer;
      
      if (area) {
        // Capture specific area
        imageBuffer = await screenshot({
          format: 'png', // Always capture as PNG first for processing
          screen: monitor,
          crop: {
            x: area.x,
        y: area.y,
            width: area.width,
            height: area.height
          }
        });
      } else {
        // Capture full screen
        imageBuffer = await screenshot({
          format: 'png', // Always capture as PNG first
          screen: monitor
        });
      }

      // Process image if needed
      let finalBuffer = imageBuffer;
      let metadata = await sharp(imageBuffer).metadata();

      if (format === 'jpeg' || format === 'jpg') {
        finalBuffer = await sharp(imageBuffer)
          .jpeg({ quality })
          .toBuffer();
        metadata = await sharp(finalBuffer).metadata();
      } else if (format === 'png' && quality < 100) {
        finalBuffer = await sharp(imageBuffer)
          .png({ quality })
          .toBuffer();
        metadata = await sharp(finalBuffer).metadata();
      }

      const result = {
        success: true,
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        size: finalBuffer.length,
        sizeFormatted: screenshotStorage.formatFileSize(finalBuffer.length),
        monitor,
        timestamp: new Date(),
        base64: finalBuffer.toString('base64'),
        executionTime: Date.now() - startTime
      };

      // Save to file if requested
      if (saveToFile) {
        const fileInfo = await screenshotStorage.saveScreenshot(finalBuffer, filename);
        result.filename = fileInfo.filename;
        result.filepath = fileInfo.filepath;
      }

      // Update operation log
      operationLogger.logOperation({
        operation: 'CAPTURE',
        success: true,
        file: result.filename,
        size: result.sizeFormatted,
        executionTime: result.executionTime
      });

      logger.info('Screenshot captured successfully', {
        filename: result.filename,
        size: result.sizeFormatted,
        dimensions: `${result.width}x${result.height}`,
        executionTime: result.executionTime
      });

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      operationLogger.logOperation({
        operation: 'CAPTURE',
        success: false,
        error: error.message,
        executionTime
      });

      logger.error('Screenshot capture failed', { 
        error: error.message,
        executionTime,
        options 
      });

      throw new Error(`Screenshot capture failed: ${error.message}`);
    }
  }

  /**
   * Start automatic screenshot capture
   * @param {number} interval - Capture interval in milliseconds
   * @returns {Promise<boolean>} Success status
   */
  async startAutoCapture(interval = 30000) {
    try {
      if (process.env.ALLOW_AUTO_CAPTURE !== 'true') {
        throw new Error('Auto capture is disabled in configuration');
      }

      if (this.autoCapture.enabled) {
        await this.stopAutoCapture();
      }

      this.autoCapture.interval = interval;
      this.autoCapture.enabled = true;

      this.autoCapture.timer = setInterval(async () => {
        try {
          await this.capture({
            saveToFile: true,
            monitor: parseInt(process.env.AUTO_CAPTURE_MONITOR) || 0
          });
          
          logger.debug('Auto capture completed');
        } catch (error) {
          logger.error('Auto capture failed', { error: error.message });
        }
      }, interval);

      logger.info('Auto capture started', { 
        interval: `${interval}ms`,
        intervalFormatted: `${interval / 1000}s`
      });

      // Take first screenshot immediately
      setTimeout(() => {
        this.capture({
          saveToFile: true,
          monitor: parseInt(process.env.AUTO_CAPTURE_MONITOR) || 0
        }).catch(error => {
          logger.error('Initial auto capture failed', { error: error.message });
        });
      }, 1000);

      return true;
    } catch (error) {
      logger.error('Failed to start auto capture', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop automatic screenshot capture
   * @returns {Promise<boolean>} Success status
   */
  async stopAutoCapture() {
    try {
      if (this.autoCapture.timer) {
        clearInterval(this.autoCapture.timer);
        this.autoCapture.timer = null;
      }

      this.autoCapture.enabled = false;
      this.autoCapture.interval = null;

      logger.info('Auto capture stopped');
      return true;
    } catch (error) {
      logger.error('Failed to stop auto capture', { error: error.message });
      throw error;
    }
  }

  /**
   * Get auto capture status
   * @returns {object} Auto capture status
   */
  getAutoCaptureStatus() {
    return {
      enabled: this.autoCapture.enabled,
      interval: this.autoCapture.interval,
      intervalFormatted: this.autoCapture.interval ? `${this.autoCapture.interval / 1000}s` : null,
      nextCapture: this.autoCapture.enabled ? 
        new Date(Date.now() + this.autoCapture.interval) : null
    };
  }

  /**
   * Get available displays/monitors
   * @returns {Promise<Array>} List of available displays
   */
  async getDisplays() {
    try {
      // screenshot-desktop doesn't have a direct method to list displays
      // We'll try to capture from different screen indices to detect available monitors
      const displays = [];
      
      // Try up to 4 monitors (covers most setups)
      for (let i = 0; i < 4; i++) {
        try {
          // Test capture a small area to check if monitor exists
          await screenshot({
            format: 'png',
            screen: i,
            crop: { x: 0, y: 0, width: 100, height: 100 }
          });
          
          displays.push({
            id: i,
            name: `Monitor ${i + 1}`,
            primary: i === 0
          });
        } catch (error) {
          // Monitor doesn't exist, stop checking
          break;
        }
      }

      if (displays.length === 0) {
        displays.push({
          id: 0,
          name: 'Primary Monitor',
          primary: true
        });
      }

      return displays;
    } catch (error) {
      logger.error('Failed to get displays', { error: error.message });
      return [{ id: 0, name: 'Primary Monitor', primary: true }];
    }
  }

  /**
   * Get screenshotter statistics
   * @returns {Promise<object>} Statistics
   */
  async getStats() {
    const operationStats = operationLogger.getStats();
    const storageStats = await screenshotStorage.getStorageStats();
    const autoCaptureStatus = this.getAutoCaptureStatus();
    const displays = await this.getDisplays();

    return {
      operations: operationStats,
      storage: storageStats,
      autoCapture: autoCaptureStatus,
      displays,
      uptime: process.uptime()
    };
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    try {
      if (this.autoCapture.enabled) {
        await this.stopAutoCapture();
      }
      
      logger.info('Screenshotter shutdown completed');
    } catch (error) {
      logger.error('Error during screenshotter shutdown', { error: error.message });
    }
  }
}

// Export singleton instance
export const screenshotter = new Screenshotter();