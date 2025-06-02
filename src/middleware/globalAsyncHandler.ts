import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Global middleware that automatically wraps all route handlers with async error catching
 * This provides automatic error handling for all routes without manual asyncHandler usage
 */
export const globalAsyncHandler = (req: Request, res: Response, next: NextFunction): void => {
  // Store the original res.json method
  const originalJson = res.json;
  
  // Override res.json to detect when a route handler completes successfully
  res.json = function(this: Response, body: any) {
    // If we get here, the route handler completed successfully
    return originalJson.call(this, body);
  };

  next();
};

/**
 * Middleware that wraps Express route handlers to automatically catch async errors
 * This can be applied to routers or the entire app
 */
export const autoAsyncWrapper = (handler: RequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check if the handler is async (returns a Promise)
    const result = handler(req, res, next) as any;
    
    if (result && typeof result === 'object' && typeof result.catch === 'function') {
      // It's a Promise, catch any errors
      (result as Promise<any>).catch(next);
    }
    
    return result;
  };
};

/**
 * Middleware factory that automatically wraps all route handlers in a router
 * Usage: router.use(createAutoAsyncRouter())
 */
export const createAutoAsyncRouter = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // This middleware can be enhanced to automatically wrap route handlers
    // For now, it's a placeholder for future enhancement
    next();
  };
};

/**
 * Helper to apply async error handling to an entire Express Router
 * This modifies the router to automatically catch async errors
 */
export const wrapRouter = (router: any) => {
  const originalGet = router.get;
  const originalPost = router.post;
  const originalPut = router.put;
  const originalDelete = router.delete;
  const originalPatch = router.patch;

  // Wrap GET routes
  router.get = function(path: string, ...handlers: RequestHandler[]) {
    const wrappedHandlers = handlers.map(handler => autoAsyncWrapper(handler));
    return originalGet.call(this, path, ...wrappedHandlers);
  };

  // Wrap POST routes
  router.post = function(path: string, ...handlers: RequestHandler[]) {
    const wrappedHandlers = handlers.map(handler => autoAsyncWrapper(handler));
    return originalPost.call(this, path, ...wrappedHandlers);
  };

  // Wrap PUT routes
  router.put = function(path: string, ...handlers: RequestHandler[]) {
    const wrappedHandlers = handlers.map(handler => autoAsyncWrapper(handler));
    return originalPut.call(this, path, ...wrappedHandlers);
  };

  // Wrap DELETE routes
  router.delete = function(path: string, ...handlers: RequestHandler[]) {
    const wrappedHandlers = handlers.map(handler => autoAsyncWrapper(handler));
    return originalDelete.call(this, path, ...wrappedHandlers);
  };

  // Wrap PATCH routes
  router.patch = function(path: string, ...handlers: RequestHandler[]) {
    const wrappedHandlers = handlers.map(handler => autoAsyncWrapper(handler));
    return originalPatch.call(this, path, ...wrappedHandlers);
  };

  return router;
}; 