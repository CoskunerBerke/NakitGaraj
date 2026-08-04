import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { runScraper } from '../scripts/scraper';

@Injectable()
export class ScraperCronService {
  private readonly logger = new Logger(ScraperCronService.name);
  private isRunning = false;

  // Run automatically every 14 days at 03:00 AM
  @Cron('0 3 */14 * *')
  async handleScheduledScrape() {
    if (this.isRunning) {
      this.logger.warn('A scheduled scraping process is already running. Skipping.');
      return;
    }

    this.logger.log('--- STARTING AUTOMATED CRON VEHICLE PRICE SCRAPER ---');
    this.isRunning = true;

    try {
      // Run the refactored scraper function
      await runScraper();
      this.logger.log('--- CRON VEHICLE PRICE SCRAPER COMPLETED SUCCESSFULY ---');
    } catch (error) {
      this.logger.error('Error during scheduled scraper execution:', (error as Error).message);
    } finally {
      this.isRunning = false;
    }
  }

  // Allow manual trigger via Admin endpoints
  async triggerManualScrape(): Promise<string> {
    if (this.isRunning) {
      return 'Scraping is already in progress.';
    }

    // Trigger asynchronously so it does not block the HTTP request
    this.handleScheduledScrape().catch(err => {
      this.logger.error('Manual scrape asynchronous run failed:', err.message);
    });

    return 'Scraper started successfully in background.';
  }

  getScraperStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }
}
