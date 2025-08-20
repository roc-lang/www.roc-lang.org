const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const WEBSITE_URL = 'https://www.roc-lang.org';
const MAX_PAGES = 500; // Limit to avoid too many pages
const MAX_DEPTH = 5; // How deep to crawl
const EXCLUDE_PATTERNS = [
  /\.(pdf|zip|doc|docx|xls|xlsx|ppt|pptx)$/i, // File downloads
  /#/, // Hash fragments
  /\?.*/, // Query parameters
  /mailto:/, // Email links
  /tel:/, // Phone links
  /javascript:/, // JavaScript links
];

// Accessibility checking function using browser's built-in accessibility API
async function checkAccessibility(page) {
  const issues = [];
  
  // Use Playwright's built-in accessibility snapshot
  try {
    const snapshot = await page.accessibility.snapshot();
    
    // Parse the accessibility tree for issues
    function parseAccessibilityTree(node, depth = 0) {
      if (!node) return;
      
      // Check for accessibility violations in the node
      if (node.role && node.name !== undefined) {
        // Check for empty names on important roles
        if (['button', 'link', 'textbox', 'combobox', 'listbox'].includes(node.role) && 
            (!node.name || node.name.trim() === '')) {
          issues.push({
            type: 'missing_accessible_name',
            level: 'AA_FAIL',
            role: node.role,
            element: node.role,
            message: `${node.role} missing accessible name`
          });
        }
        
        // Check for duplicate accessible names with different purposes
        if (node.role === 'link' && node.name) {
          // This will be handled by our existing duplicate link checker
        }
      }
      
      // Recursively check children
      if (node.children) {
        node.children.forEach(child => parseAccessibilityTree(child, depth + 1));
      }
    }
    
    if (snapshot) {
      parseAccessibilityTree(snapshot);
    }
    
  } catch (error) {
    console.log('  ⚠️  Accessibility snapshot failed:', error.message);
  }
  
  // Use browser's DevTools accessibility audit via CDP
  const client = await page.context().newCDPSession(page);
  
  try {
    // Enable accessibility domain
    await client.send('Accessibility.enable');
    
    // Get accessibility violations using browser's built-in audit
    const { accessibilityNode } = await client.send('Accessibility.getFullAXTree');
    
    // Function to traverse and check nodes
    function checkAXNode(node) {
      if (!node) return;
      
      // Check for color contrast issues using browser's data
      if (node.properties) {
        for (const prop of node.properties) {
          if (prop.name === 'colorContrast' && prop.value) {
            const contrast = parseFloat(prop.value);
            const isLargeText = node.role === 'text' && 
                               node.properties.some(p => p.name === 'fontSize' && parseFloat(p.value) >= 18);
            const minContrast = isLargeText ? 3 : 4.5;
            
            if (contrast < minContrast) {
              issues.push({
                type: 'contrast',
                level: 'AA_FAIL',
                contrast: contrast,
                required: minContrast,
                isLargeText: isLargeText,
                element: node.name || 'text element',
                message: `Low contrast ratio: ${contrast}:1 (needs ${minContrast}:1)`
              });
            }
          }
        }
      }
      
      // Check children
      if (node.children) {
        node.children.forEach(checkAXNode);
      }
    }
    
    if (accessibilityNode) {
      checkAXNode(accessibilityNode);
    }
    
  } catch (error) {
    console.log('  ⚠️  CDP accessibility audit failed:', error.message);
    
    // Fallback to our DOM-based checks if CDP fails
    const domIssues = await page.evaluate(() => {
      const issues = [];
      
      // Basic DOM-based fallback checks
      // Missing alt text on images
      const images = document.querySelectorAll('img:not([alt])');
      images.forEach((img, index) => {
        issues.push({
          type: 'missing_alt',
          level: 'AA_FAIL',
          element: `img:nth-of-type(${index + 1})`,
          src: img.src,
          message: 'Image missing alt attribute'
        });
      });
      
      // Form inputs without labels
      // const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
      // inputs.forEach((input, index) => {
      //   const hasLabel = document.querySelector(`label[for="${input.id}"]`) || 
      //                   input.closest('label') ||
      //                   input.getAttribute('aria-label') ||
      //                   input.getAttribute('aria-labelledby');
      //   
      //   if (!hasLabel) {
      //     issues.push({
      //       type: 'missing_label',
      //       level: 'AA_FAIL',
      //       element: `${input.tagName.toLowerCase()}:nth-of-type(${index + 1})`,
      //       inputType: input.type || input.tagName.toLowerCase(),
      //       message: 'Form control missing accessible label'
      //     });
      //   }
      // });
      
      return issues;
    });
    
    issues.push(...domIssues);
  }
  
  // Additional DOM-based checks that we'll always run
  const additionalIssues = await page.evaluate(() => {
    
    // Check for other accessibility issues
    
    // Missing alt text on images
    const images = document.querySelectorAll('img:not([alt])');
    images.forEach((img, index) => {
      issues.push({
        type: 'missing_alt',
        level: 'AA_FAIL',
        element: `img:nth-of-type(${index + 1})`,
        src: img.src,
        message: 'Image missing alt attribute'
      });
    });
    
    // Empty alt text on decorative images (potential issue)
    const decorativeImages = document.querySelectorAll('img[alt=""]');
    decorativeImages.forEach((img, index) => {
      // Only flag if image seems important (has src and is visible)
      if (img.src && img.offsetParent !== null && img.naturalWidth > 10 && img.naturalHeight > 10) {
        issues.push({
          type: 'empty_alt_warning',
          level: 'WARNING',
          element: `img[alt=""]:nth-of-type(${index + 1})`,
          src: img.src,
          message: 'Image has empty alt text - ensure it is truly decorative'
        });
      }
    });
    
    // Form inputs without labels
    // const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
    // inputs.forEach((input, index) => {
    //   const hasLabel = document.querySelector(`label[for="${input.id}"]`) || 
    //                  input.closest('label') ||
    //                  input.getAttribute('aria-label') ||
    //                  input.getAttribute('aria-labelledby');
    //   
    //   if (!hasLabel) {
    //     issues.push({
    //       type: 'missing_label',
    //       level: 'AA_FAIL',
    //       element: `${input.tagName.toLowerCase()}:nth-of-type(${index + 1})`,
    //       inputType: input.type || input.tagName.toLowerCase(),
    //       message: 'Form control missing accessible label'
    //     });
    //   }
    // });
    
    // Links with same text but different destinations
    const links = document.querySelectorAll('a[href]');
    const linkTexts = new Map();
    
    links.forEach(link => {
      const text = link.textContent.trim();
      const href = link.href;
      
      if (text) {
        if (!linkTexts.has(text)) {
          linkTexts.set(text, new Set());
        }
        linkTexts.get(text).add(href);
      }
    });
    
    linkTexts.forEach((hrefs, text) => {
      if (hrefs.size > 1 && text.length < 100) { // Don't flag very long link texts
        issues.push({
          type: 'ambiguous_links',
          level: 'WARNING',
          linkText: text,
          destinations: Array.from(hrefs),
          message: `Multiple links with same text "${text}" go to different destinations`
        });
      }
    });
    
    return issues;
  });
  
  return issues;
}

async function discoverInternalLinks(page, startUrl, maxPages = MAX_PAGES, maxDepth = MAX_DEPTH) {
  const discovered = new Set();
  const toVisit = [{ url: startUrl, depth: 0, foundOn: null }];
  const visited = new Set();
  const discoveryPath = new Map(); // Track where each link was found
  
  console.log('🔍 Discovering internal links...');
  
  while (toVisit.length > 0 && discovered.size < maxPages) {
    const { url, depth, foundOn } = toVisit.shift();
    
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
      
      // Record discovery path for current page (except homepage)
      if (foundOn && !discoveryPath.has(currentPath)) {
        discoveryPath.set(currentPath, foundOn);
      }
      
      // Filter and add new links to visit
      for (const link of links) {
        const linkPath = new URL(link, WEBSITE_URL).pathname.replace(/\/$/, '') || '/';
        
        // Check if link should be excluded
        const shouldExclude = EXCLUDE_PATTERNS.some(pattern => pattern.test(link));
        
        if (!shouldExclude && !visited.has(link) && depth < maxDepth) {
          toVisit.push({ url: link, depth: depth + 1, foundOn: currentPath });
        }
        
        // Add to discovered even if we won't visit (for shallow pages)
        if (!shouldExclude) {
          discovered.add(linkPath);
          // Record where we found this link if we haven't seen it before
          if (!discoveryPath.has(linkPath)) {
            discoveryPath.set(linkPath, currentPath);
          }
        }
      }
      
    } catch (error) {
      console.log(`  ⚠️  Failed to scan ${url}: ${error.message}`);
    }
    
    await page.waitForTimeout(500);
  }
  
  const finalPages = Array.from(discovered).slice(0, maxPages);
  console.log(`📋 Discovered ${finalPages.length} pages to check:`, finalPages);
  return { pages: finalPages, discoveryPath };
}

async function checkPage(page, url) {
  console.log(`Checking: ${url}`);
  
  // Remove any existing listeners to prevent accumulation
  page.removeAllListeners('console');
  page.removeAllListeners('response');
  page.removeAllListeners('pageerror');
  
  const errors = [];
  const warnings = [];
  const networkFailures = [];
  let accessibilityIssues = [];
  
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
      const responseUrl = response.url();
      const resourceType = response.request().resourceType();
      const isMainDocument = responseUrl === url;
      const isFromSameDomain = responseUrl.startsWith(WEBSITE_URL);
      
      // Only log failures that are relevant to the current page
      if (isMainDocument || (isFromSameDomain && ['stylesheet', 'script', 'image', 'font'].includes(resourceType))) {
        networkFailures.push({
          type: 'network_error',
          status: response.status(),
          url: responseUrl,
          page: url,
          resourceType: resourceType,
          isMainDocument: isMainDocument,
          timestamp: new Date().toISOString()
        });
      }
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
    
    // Run accessibility checks
    try {
      accessibilityIssues = await checkAccessibility(page);
    } catch (error) {
      console.log(`  ⚠️  Accessibility check failed for ${url}: ${error.message}`);
      errors.push({
        type: 'accessibility_check_error',
        message: `Failed to run accessibility checks: ${error.message}`,
        url: url,
        timestamp: new Date().toISOString()
      });
    }
    
    return {
      url,
      errors,
      warnings,
      networkFailures,
      accessibilityIssues,
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
      accessibilityIssues: [],
      success: false
    };
  }
}

function countIssues(results) {
  const errorCounts = new Map();
  const warningCounts = new Map();
  const networkFailureCounts = new Map();
  const accessibilityCounts = new Map();
  
  for (const result of results) {
    // Count errors
    for (const error of result.errors) {
      const key = error.message;
      errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
    }
    
    // Count warnings
    for (const warning of result.warnings) {
      const key = warning.message;
      warningCounts.set(key, (warningCounts.get(key) || 0) + 1);
    }
    
    // Count network failures
    for (const failure of result.networkFailures) {
      const resourceInfo = failure.isMainDocument 
        ? ' (main document)' 
        : ` (${failure.resourceType})`;
      const key = `**${failure.status}** - ${failure.url}${resourceInfo}`;
      networkFailureCounts.set(key, (networkFailureCounts.get(key) || 0) + 1);
    }
    
    // Count accessibility issues
    for (const issue of result.accessibilityIssues) {
      let key;
      switch (issue.type) {
        case 'contrast':
          key = `Low contrast (${issue.contrast}:1, needs ${issue.required}:1)`;
          break;
        case 'missing_alt':
          key = 'Image missing alt attribute';
          break;
        case 'empty_alt_warning':
          key = 'Image with empty alt text';
          break;
        case 'missing_label':
          key = 'Form control missing label';
          break;
        case 'ambiguous_links':
          key = `Ambiguous link text: "${issue.linkText}"`;
          break;
        default:
          key = issue.message || issue.type;
      }
      accessibilityCounts.set(key, (accessibilityCounts.get(key) || 0) + 1);
    }
  }
  
  return { errorCounts, warningCounts, networkFailureCounts, accessibilityCounts };
}

async function generateReport(results, discoveryPath) {
  const timestamp = new Date().toISOString();
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  const totalNetworkFailures = results.reduce((sum, r) => sum + r.networkFailures.length, 0);
  const totalAccessibilityIssues = results.reduce((sum, r) => sum + r.accessibilityIssues.length, 0);
  
  let report = `# Website Console & Accessibility Check Report\n`;
  report += `**Generated:** ${timestamp}\n`;
  report += `**Website:** ${WEBSITE_URL}\n\n`;
  
  report += `## Summary\n`;
  report += `- **Console Errors:** ${totalErrors}\n`;
  report += `- **Console Warnings:** ${totalWarnings}\n`;
  report += `- **Network Failures:** ${totalNetworkFailures}\n`;
  report += `- **Accessibility Issues:** ${totalAccessibilityIssues}\n`;
  report += `- **Pages Checked:** ${results.length}\n\n`;
  
  const totalIssues = totalErrors + totalWarnings + totalNetworkFailures + totalAccessibilityIssues;
  if (totalIssues === 0) {
    report += `✅ **All pages are clean!** No errors, warnings, or accessibility issues found.\n\n`;
  } else {
    report += `❌ **Issues found** - see details below.\n\n`;
  }
  
  // Detailed results for each page
  for (const result of results) {
    const pagePath = new URL(result.url).pathname.replace(/\/$/, '') || '/';
    report += `## Page: ${result.url}\n`;
    
    // Add discovery path information
    if (discoveryPath.has(pagePath)) {
      const foundOnPath = discoveryPath.get(pagePath);
      report += `**Found on:** ${WEBSITE_URL}${foundOnPath}\n\n`;
    } else if (pagePath === '/') {
      report += `**Source:** Homepage (starting point)\n\n`;
    } else {
      report += `**Source:** Unknown (possibly homepage)\n\n`;
    }
    
    if (!result.success) {
      report += `❌ **Failed to load page**\n\n`;
    } else {
      const pageIssues = result.errors.length + result.warnings.length + 
                        result.networkFailures.length + result.accessibilityIssues.length;
      if (pageIssues === 0) {
        report += `✅ **No issues found**\n\n`;
      }
    }
    
    if (result.errors.length > 0) {
      report += `### Console Errors (${result.errors.length})\n`;
      result.errors.forEach((error, i) => {
        report += `${i + 1}. **${error.type}**: ${error.message}\n`;
        if (error.stack) {
          report += `   \`\`\`\n   ${error.stack}\n   \`\`\`\n`;
        }
      });
      report += `\n`;
    }
    
    if (result.warnings.length > 0) {
      report += `### Console Warnings (${result.warnings.length})\n`;
      result.warnings.forEach((warning, i) => {
        report += `${i + 1}. ${warning.message}\n`;
      });
      report += `\n`;
    }
    
    if (result.networkFailures.length > 0) {
      report += `### Network Failures (${result.networkFailures.length})\n`;
      result.networkFailures.forEach((failure, i) => {
        const resourceInfo = failure.isMainDocument 
          ? ' (main document)' 
          : ` (${failure.resourceType})`;
        report += `${i + 1}. **${failure.status}** - ${failure.url}${resourceInfo}\n`;
      });
      report += `\n`;
    }
    
    if (result.accessibilityIssues.length > 0) {
      report += `### Accessibility Issues (${result.accessibilityIssues.length})\n`;
      result.accessibilityIssues.forEach((issue, i) => {
        switch (issue.type) {
          case 'contrast':
            report += `${i + 1}. **Color Contrast** (${issue.level}): `;
            report += `Text "${issue.text}" has contrast ratio ${issue.contrast}:1 `;
            report += `(needs ${issue.required}:1). `;
            report += `Colors: ${issue.colors.foreground} on ${issue.colors.background} `;
            report += `(Element: ${issue.element})\n`;
            break;
          case 'missing_alt':
            report += `${i + 1}. **Missing Alt Text**: Image without alt attribute `;
            report += `(${issue.src})\n`;
            break;
          case 'empty_alt_warning':
            report += `${i + 1}. **Empty Alt Warning**: ${issue.message} `;
            report += `(${issue.src})\n`;
            break;
          case 'missing_label':
            report += `${i + 1}. **Missing Label**: ${issue.message} `;
            report += `(${issue.inputType} element)\n`;
            break;
          case 'ambiguous_links':
            report += `${i + 1}. **Ambiguous Links**: ${issue.message}\n`;
            report += `   Destinations: ${issue.destinations.join(', ')}\n`;
            break;
          default:
            report += `${i + 1}. **${issue.type}**: ${issue.message || 'Unknown issue'}\n`;
        }
      });
      report += `\n`;
    }
  }
  
  // Add issue counts section at the end
  const { errorCounts, warningCounts, networkFailureCounts, accessibilityCounts } = countIssues(results);
  
  if (errorCounts.size > 0 || warningCounts.size > 0 || networkFailureCounts.size > 0 || accessibilityCounts.size > 0) {
    report += `---\n\n## Issue Frequency Summary\n\n`;
    
    if (errorCounts.size > 0) {
      report += `### Console Error Frequency\n`;
      const sortedErrors = Array.from(errorCounts.entries()).sort((a, b) => b[1] - a[1]);
      sortedErrors.forEach(([message, count]) => {
        report += `- **${count}x** ${message}\n`;
      });
      report += `\n`;
    }
    
    if (warningCounts.size > 0) {
      report += `### Console Warning Frequency\n`;
      const sortedWarnings = Array.from(warningCounts.entries()).sort((a, b) => b[1] - a[1]);
      sortedWarnings.forEach(([message, count]) => {
        report += `- **${count}x** ${message}\n`;
      });
      report += `\n`;
    }
    
    if (networkFailureCounts.size > 0) {
      report += `### Network Failure Frequency\n`;
      const sortedFailures = Array.from(networkFailureCounts.entries()).sort((a, b) => b[1] - a[1]);
      sortedFailures.forEach(([message, count]) => {
        report += `- **${count}x** ${message}\n`;
      });
      report += `\n`;
    }
    
    if (accessibilityCounts.size > 0) {
      report += `### Accessibility Issue Frequency\n`;
      const sortedAccessibility = Array.from(accessibilityCounts.entries()).sort((a, b) => b[1] - a[1]);
      sortedAccessibility.forEach(([message, count]) => {
        report += `- **${count}x** ${message}\n`;
      });
      report += `\n`;
    }
  }
  
  return report;
}

async function main() {
  console.log('Starting website console & accessibility check...');
  
  const browser = await chromium.launch();
  const context = await browser.newContext({
    // Simulate a real browser
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  
  // Discover internal links starting from homepage
  const discoveryResult = await discoverInternalLinks(page, WEBSITE_URL);
  const pagesToCheck = discoveryResult.pages;
  const discoveryPath = discoveryResult.discoveryPath;
  const results = [];
  
  console.log(`\n🧪 Starting console & accessibility checks on ${pagesToCheck.length} pages...\n`);
  
  for (const pagePath of pagesToCheck) {
    const fullUrl = WEBSITE_URL + pagePath;
    const result = await checkPage(page, fullUrl);
    results.push(result);
    
    // Small delay between pages
    await page.waitForTimeout(1000);
  }
  
  await browser.close();
  
  // Generate and save report
  const report = await generateReport(results, discoveryPath);
  
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
    sum + r.errors.length + r.warnings.length + r.networkFailures.length + r.accessibilityIssues.length, 0
  );
  
  if (totalIssues > 0) {
    console.log(`❌ Found ${totalIssues} issues (including accessibility)`);
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