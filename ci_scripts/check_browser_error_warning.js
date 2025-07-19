const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const WEBSITE_URL = 'https://www.roc-lang.org';
const MAX_PAGES = 100; // Limit to avoid too many pages
const MAX_DEPTH = 4; // How deep to crawl
const EXCLUDE_PATTERNS = [
  /\.(pdf|zip|doc|docx|xls|xlsx|ppt|pptx)$/i, // File downloads
  /#/, // Hash fragments
  /\?.*/, // Query parameters
  /mailto:/, // Email links
  /tel:/, // Phone links
  /javascript:/, // JavaScript links
];

async function discoverInternalLinks(page, startUrl, maxPages = MAX_PAGES, maxDepth = MAX_DEPTH) {
  const discovered = new Set();
  const toVisit = [{ url: startUrl, depth: 0 }];
  const visited = new Set();
  
  console.log('🔍 Discovering internal links...');
  
  while (toVisit.length > 0 && discovered.size < maxPages) {
    const { url, depth } = toVisit.shift();
    
    if (visited.has(url) || depth > maxDepth) continue;
    visited.add(url);
    
    try {
      console.log(`  Scanning: ${url} (depth ${depth})`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      
      // Extract all links
      const links = await page.evaluate((baseUrl) => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors
          .map(a => a.href)
          .filter(href => {
            try {
              const linkUrl = new URL(href);
              const baseUrlObj = new URL(baseUrl);
              return linkUrl.hostname === baseUrlObj.hostname; // Same domain only
            } catch {
              return false;
            }
          })
          .map(href => {
            // Normalize URL - remove hash and trailing slash
            const url = new URL(href);
            return url.origin + url.pathname.replace(/\/$/, '') || '/';
          });
      }, WEBSITE_URL);
      
      // Add current page to discovered
      const normalizedCurrentUrl = new URL(url);
      const currentPath = normalizedCurrentUrl.pathname.replace(/\/$/, '') || '/';
      discovered.add(currentPath);
      
      // Filter and add new links to visit
      for (const link of links) {
        const linkPath = new URL(link, WEBSITE_URL).pathname.replace(/\/$/, '') || '/';
        
        // Check if link should be excluded
        const shouldExclude = EXCLUDE_PATTERNS.some(pattern => pattern.test(link));
        
        if (!shouldExclude && !visited.has(link) && depth < maxDepth) {
          toVisit.push({ url: link, depth: depth + 1 });
        }
        
        // Add to discovered even if we won't visit (for shallow pages)
        if (!shouldExclude) {
          discovered.add(linkPath);
        }
      }
      
    } catch (error) {
      console.log(`  ⚠️  Failed to scan ${url}: ${error.message}`);
    }
    
    await page.waitForTimeout(500);
  }
  
  const finalPages = Array.from(discovered).slice(0, maxPages);
  console.log(`📋 Discovered ${finalPages.length} pages to check:`, finalPages);
  return finalPages;
}

// Add the missing async checkPage function
async function checkPage(page, url) {
  console.log(`Checking: ${url}`);
  
  const errors = [];
  const warnings = [];
  const networkFailures = [];
  
  // Capture console messages
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    
    if (type === 'error') {
      errors.push({
        type: 'console_error',
        message: text,
        url: url,
        timestamp: new Date().toISOString()
      });
    }
    
    if (type === 'warning') {
      warnings.push({
        type: 'console_warning',
        message: text,
        url: url,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Capture network failures
  page.on('response', response => {
    if (response.status() >= 400) {
      networkFailures.push({
        type: 'network_error',
        status: response.status(),
        url: response.url(),
        page: url,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Capture JavaScript errors
  page.on('pageerror', error => {
    errors.push({
      type: 'page_error',
      message: error.message,
      stack: error.stack,
      url: url,
      timestamp: new Date().toISOString()
    });
  });
  
  try {
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Wait a bit more for dynamic content
    await page.waitForTimeout(2000);
    
    return {
      url,
      errors,
      warnings,
      networkFailures,
      success: true
    };
    
  } catch (error) {
    return {
      url,
      errors: [{
        type: 'navigation_error',
        message: error.message,
        url: url,
        timestamp: new Date().toISOString()
      }],
      warnings,
      networkFailures,
      success: false
    };
  }
}

async function generateReport(results) {
  const timestamp = new Date().toISOString();
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  const totalNetworkFailures = results.reduce((sum, r) => sum + r.networkFailures.length, 0);
  
  let report = `# Website Console Check Report\n`;
  report += `**Generated:** ${timestamp}\n`;
  report += `**Website:** ${WEBSITE_URL}\n\n`;
  
  report += `## Summary\n`;
  report += `- **Total Errors:** ${totalErrors}\n`;
  report += `- **Total Warnings:** ${totalWarnings}\n`;
  report += `- **Network Failures:** ${totalNetworkFailures}\n`;
  report += `- **Pages Checked:** ${results.length}\n\n`;
  
  if (totalErrors === 0 && totalWarnings === 0 && totalNetworkFailures === 0) {
    report += `✅ **All pages are clean!** No errors or warnings found.\n\n`;
  } else {
    report += `❌ **Issues found** - see details below.\n\n`;
  }
  
  // Detailed results for each page
  for (const result of results) {
    report += `## Page: ${result.url}\n`;
    
    if (!result.success) {
      report += `❌ **Failed to load page**\n\n`;
    } else if (result.errors.length === 0 && result.warnings.length === 0 && result.networkFailures.length === 0) {
      report += `✅ **No issues found**\n\n`;
    }
    
    if (result.errors.length > 0) {
      report += `### Errors (${result.errors.length})\n`;
      result.errors.forEach((error, i) => {
        report += `${i + 1}. **${error.type}**: ${error.message}\n`;
        if (error.stack) {
          report += `   \`\`\`\n   ${error.stack}\n   \`\`\`\n`;
        }
      });
      report += `\n`;
    }
    
    if (result.warnings.length > 0) {
      report += `### Warnings (${result.warnings.length})\n`;
      result.warnings.forEach((warning, i) => {
        report += `${i + 1}. ${warning.message}\n`;
      });
      report += `\n`;
    }
    
    if (result.networkFailures.length > 0) {
      report += `### Network Failures (${result.networkFailures.length})\n`;
      result.networkFailures.forEach((failure, i) => {
        report += `${i + 1}. **${failure.status}** - ${failure.url}\n`;
      });
      report += `\n`;
    }
  }
  
  return report;
}

async function main() {
  console.log('Starting website console check...');
  
  const browser = await chromium.launch();
  const context = await browser.newContext({
    // Simulate a real browser
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  
  // Discover internal links starting from homepage
  const pagesToCheck = await discoverInternalLinks(page, WEBSITE_URL);
  const results = [];
  
  console.log(`\n🧪 Starting console checks on ${pagesToCheck.length} pages...\n`);
  
  for (const pagePath of pagesToCheck) {
    const fullUrl = WEBSITE_URL + pagePath;
    const result = await checkPage(page, fullUrl);
    results.push(result);
    
    // Small delay between pages
    await page.waitForTimeout(1000);
  }
  
  await browser.close();
  
  // Generate and save report
  const report = await generateReport(results);
  
  // Ensure results directory exists
  const resultsDir = path.join(process.cwd(), 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  // Save markdown report
  const reportPath = path.join(resultsDir, `report-${new Date().toISOString().split('T')[0]}.md`);
  fs.writeFileSync(reportPath, report);
  
  // Save JSON data for programmatic access
  const jsonPath = path.join(resultsDir, `data-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  
  console.log(`Report saved to: ${reportPath}`);
  console.log(report);
  
  // Exit with error code if issues found
  const totalIssues = results.reduce((sum, r) => 
    sum + r.errors.length + r.warnings.length + r.networkFailures.length, 0
  );
  
  if (totalIssues > 0) {
    console.log(`❌ Found ${totalIssues} issues`);
    process.exit(1);
  } else {
    console.log('✅ No issues found');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
