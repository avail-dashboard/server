#!/usr/bin/env tsx

/**
 * QueueService Demonstration Script
 * 
 * This script demonstrates the QueueService functionality:
 * - Starting the service
 * - Adding different types of jobs
 * - Monitoring queue statistics
 * - Health checks
 */

import { queueService } from '../src/services/core/queue';
import { logger } from '../src/utils/logger';

async function demonstrateQueueService() {
  try {
    logger.info('🚀 Starting QueueService demonstration...');

    // Start the queue service
    logger.info('📦 Starting QueueService...');
    await queueService.start();
    logger.info('✅ QueueService started successfully');

    // Check initial health
    const initialHealth = await queueService.getHealth();
    logger.info('🏥 Initial health status:', initialHealth);

    // Add some test jobs
    logger.info('📝 Adding test jobs...');

    // Schedule block indexing job
    const blockJob = await queueService.scheduleBlockIndexing(12345, 1);
    logger.info('🧱 Block indexing job scheduled:', { jobId: blockJob.id });

    // Schedule extrinsic processing job
    const extrinsicJob = await queueService.scheduleExtrinsicProcessing('0x1234...abcd', 2);
    logger.info('📋 Extrinsic processing job scheduled:', { jobId: extrinsicJob.id });

    // Schedule analytics calculation
    const analyticsJob = await queueService.scheduleAnalyticsCalculation('network', '24h');
    logger.info('📊 Analytics calculation job scheduled:', { jobId: analyticsJob.id });

    // Schedule data sync
    const syncJob = await queueService.scheduleDataSync(1000, 2000);
    logger.info('🔄 Data sync job scheduled:', { jobId: syncJob.id });

    // Schedule health check with delay
    const healthJob = await queueService.scheduleHealthCheck(5000); // 5 second delay
    logger.info('🏥 Health check job scheduled:', { jobId: healthJob.id });

    // Wait a moment for jobs to be processed
    logger.info('⏳ Waiting for jobs to be processed...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check queue statistics
    const stats = await queueService.getStats();
    logger.info('📈 Queue statistics:', stats);

    // Check health again
    const finalHealth = await queueService.getHealth();
    logger.info('🏥 Final health status:', finalHealth);

    // Demonstrate queue management
    logger.info('⏸️ Pausing queue...');
    await queueService.pauseQueue();

    logger.info('▶️ Resuming queue...');
    await queueService.resumeQueue();

    logger.info('🧹 Clearing queue...');
    await queueService.clearQueue();

    // Final stats
    const finalStats = await queueService.getStats();
    logger.info('📈 Final queue statistics:', finalStats);

  } catch (error) {
    logger.error('❌ Error during QueueService demonstration:', error);
  } finally {
    // Stop the service
    logger.info('🛑 Stopping QueueService...');
    await queueService.stop();
    logger.info('✅ QueueService stopped successfully');
    
    logger.info('🎉 QueueService demonstration completed!');
  }
}

// Run the demonstration
demonstrateQueueService().catch((error) => {
  logger.error('💥 Fatal error in demonstration:', error);
  throw error;
}); 