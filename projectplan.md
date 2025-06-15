Plan: Clean Up API Response Formatting Layer 
 
Problem Analysis 
 
- ✅ Timestamp serialization is fixed (Date objects → ISO strings)
- 🔧 Routes are applying redundant keysToCamelCase conversion on already-correct API response types
- 🔧 Inconsistent response wrapping: some use { data: { dataSubmissions: [...] } }, others use { data: [...] } 
- 🔧 Response format doesn't match Postman collection expectations 
 
Solution: Create Clean Response Formatting Layer 
 
1. Remove Redundant Field Conversion 
 
- Remove keysToCamelCase calls from routes since API response types already have correct field names 
- Services already return properly formatted *ApiResponse types
 
2. Standardize Response Structure
 
- Make all endpoints return consistent format: { success: true, data: [...], pagination/meta: {...} }
- Remove nested wrapping like { data: { dataSubmissions: [...] } } 
 
3. Create Response Helper Utility
 
- Build a clean response formatter utility for consistent API responses
- Handle pagination metadata uniformly across all endpoints
 
4. Update Affected Routes
 
- Fix data-submissions route response structure
- Fix extrinsics route response structure
- Ensure blocks route consistency
 
Files to Modify
 
- src/routes/data-submissions.ts - Remove keysToCamelCase, fix response structure
- src/routes/extrinsics.ts - Remove keysToCamelCase, fix response structure
- src/utils/responseFormatter.ts - New utility for consistent responses
- Test endpoints to verify correct format
 
Expected Outcome 
 
APIs will return clean, consistent responses matching Postman collection format while keeping the fixed timestamp
serialization. 