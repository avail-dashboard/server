#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const workflowsDir = path.join(__dirname, 'workflows');
const workflows = ['test.yml', 'quality.yml', 'performance.yml', 'security.yml'];

console.log('🔍 Validating GitHub Actions workflows...\n');

let allValid = true;

workflows.forEach(workflow => {
  const filePath = path.join(workflowsDir, workflow);
  
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`❌ ${workflow}: File not found`);
      allValid = false;
      return;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(content);
    
    // Basic validation
    if (!parsed.name) {
      console.log(`❌ ${workflow}: Missing 'name' field`);
      allValid = false;
      return;
    }
    
    if (!parsed.on) {
      console.log(`❌ ${workflow}: Missing 'on' field`);
      allValid = false;
      return;
    }
    
    if (!parsed.jobs) {
      console.log(`❌ ${workflow}: Missing 'jobs' field`);
      allValid = false;
      return;
    }
    
    console.log(`✅ ${workflow}: Valid (${parsed.name})`);
    
    // Check for required fields in jobs
    Object.keys(parsed.jobs).forEach(jobName => {
      const job = parsed.jobs[jobName];
      if (!job.steps) {
        console.log(`   ⚠️  Job '${jobName}' missing steps`);
      }
    });
    
  } catch (error) {
    console.log(`❌ ${workflow}: Invalid YAML - ${error.message}`);
    allValid = false;
  }
});

console.log('\n' + '='.repeat(50));

if (allValid) {
  console.log('🎉 All workflows are valid!');
  console.log('\n📋 Summary:');
  console.log('- Test Suite: Comprehensive testing with multi-node support');
  console.log('- Code Quality: Linting, formatting, and type checking');
  console.log('- Performance: Load testing with Artillery.js');
  console.log('- Security: Vulnerability scanning and code analysis');
  console.log('\n🚀 Ready for GitHub Actions!');
  process.exit(0);
} else {
  console.log('❌ Some workflows have issues. Please fix them before committing.');
  process.exit(1);
} 