#!/usr/bin/env node

/**
 * Generate a standalone HTML file with dependency graph data embedded
 * 
 * Usage:
 *   node generate-standalone-graph.mjs <json-file>
 *   echo '{"nodes":[...],"edges":[...]}' | node generate-standalone-graph.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function generateStandaloneGraph(data) {
  // Read the standalone HTML template
  const templatePath = join(__dirname, 'ui', 'dependency-graph-standalone.html');
  const template = readFileSync(templatePath, 'utf-8');
  
  // Embed the data in the HTML
  const dataScript = `
    <script>
      // Embedded graph data
      window.embeddedGraphData = ${JSON.stringify(data, null, 2)};
      
      // Auto-load on page load
      window.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
          if (window.embeddedGraphData) {
            loadGraphData(window.embeddedGraphData);
          }
        }, 100);
      });
    </script>
  `;
  
  // Insert the script before the closing body tag
  const html = template.replace('</body>', dataScript + '</body>');
  
  // Write output file
  const outputPath = join(__dirname, 'dependency-graph-output.html');
  writeFileSync(outputPath, html, 'utf-8');
  
  console.log(`✅ Generated standalone graph: ${outputPath}`);
  console.log(`   Open this file in your browser to view the visualization`);
  
  return outputPath;
}

// Main execution
async function main() {
  let input = '';
  
  if (process.stdin.isTTY) {
    // Check for file argument
    const filePath = process.argv[2];
    if (filePath) {
      try {
        input = readFileSync(filePath, 'utf-8');
      } catch (e) {
        console.error(`Failed to read file ${filePath}:`, e.message);
        process.exit(1);
      }
    } else {
      console.error('Usage:');
      console.error('  node generate-standalone-graph.mjs <json-file>');
      console.error('  echo \'{"nodes":[...],"edges":[...]}\' | node generate-standalone-graph.mjs');
      process.exit(1);
    }
  } else {
    // Read from stdin
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      input += chunk;
    }
  }
  
  let data;
  try {
    data = JSON.parse(input);
  } catch (e) {
    console.error('Failed to parse JSON:', e.message);
    process.exit(1);
  }
  
  await generateStandaloneGraph(data);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
