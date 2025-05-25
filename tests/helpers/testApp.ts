import express from 'express';
import request from 'supertest';
import server from '../../src/index';

export class TestApp {
  private server: typeof server;
  private app: express.Application;

  constructor() {
    this.server = server;
    this.app = this.server.getApp();
  }

  getApp(): express.Application {
    return this.app;
  }

  getServer(): typeof server {
    return this.server;
  }

  request() {
    return request(this.app);
  }

  async start(): Promise<void> {
    await this.server.start();
  }

  async stop(): Promise<void> {
    // Add cleanup logic if needed
  }
}

export const createTestApp = (): TestApp => {
  return new TestApp();
}; 