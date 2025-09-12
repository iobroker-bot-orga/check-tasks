#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Clean URLs and GitHub links from issue messages to enable deduplication
 *
 * @param {string} message - The issue message to clean
 * @returns {string} The cleaned message
 */
function cleanIssueMessage(message) {
    return (
        message
            // Remove GitHub repository links like [package.json](https://github.com/...)
            .replace(/\[([^\]]+)\]\(https:\/\/github\.com\/[^)]+\)/g, '[$1]')
            // Remove direct GitHub URLs
            .replace(/https:\/\/github\.com\/[^\s)]+/g, '')
            // Remove NPM URLs
            .replace(/https:\/\/www\.npmjs\.com\/[^\s)]+/g, '[NPM]')
            // Remove other URLs
            .replace(/https:\/\/[^\s)]+/g, '')
            // Clean up extra spaces
            .replace(/\s+/g, ' ')
            .trim()
    );
}

/**
 * Extract issue number from issue code like [E116] or [W037]
 *
 * @param {string} issueCode - The issue code to parse
 * @returns {number} The extracted issue number
 */
function extractIssueNumber(issueCode) {
    const match = issueCode.match(/^\[([EWS])(\d+)\]/);
    return match ? parseInt(match[2], 10) : 0;
}

/**
 * Get severity from issue code (E, W, S)
 *
 * @param {string} issueCode - The issue code to parse
 * @returns {string} The severity level (E, W, or S)
 */
function getSeverity(issueCode) {
    const match = issueCode.match(/^\[([EWS])\d+\]/);
    return match ? match[1] : 'S';
}

/**
 * Read all statistics files and aggregate issues
 */
function readStatisticsFiles() {
    const statisticsDir = path.join(__dirname, '..', 'statistics');
    const files = fs.readdirSync(statisticsDir).filter(f => f.endsWith('.json'));

    const aggregatedIssues = {};

    for (const file of files) {
        const filePath = path.join(statisticsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        try {
            const data = JSON.parse(content);

            for (const [, issueData] of Object.entries(data)) {
                const { issue, adapter } = issueData;
                const cleanedMessage = cleanIssueMessage(issue);
                const issueNumber = extractIssueNumber(issue);
                const severity = getSeverity(issue);

                if (!aggregatedIssues[cleanedMessage]) {
                    aggregatedIssues[cleanedMessage] = {
                        originalIssue: issue,
                        adapters: [],
                        severity: severity,
                        issueNumber: issueNumber,
                    };
                }

                // Add adapter with repository link
                const adapterName = file.replace('.json', '');
                const repoLink = `[${adapter}](https://github.com/${adapter})`;

                if (!aggregatedIssues[cleanedMessage].adapters.includes(`- ${adapterName} ${repoLink}`)) {
                    aggregatedIssues[cleanedMessage].adapters.push(`- ${adapterName} ${repoLink}`);
                }
            }
        } catch (error) {
            console.error(`Error parsing ${file}:`, error);
        }
    }

    return aggregatedIssues;
}

/**
 * Generate markdown report
 *
 * @param {object} aggregatedIssues - Object containing aggregated issues data
 * @returns {string} The generated markdown report
 */
function generateMarkdownReport(aggregatedIssues) {
    const errors = [];
    const warnings = [];
    const suggestions = [];

    // Categorize issues by severity
    for (const [, issueData] of Object.entries(aggregatedIssues)) {
        const item = {
            message: issueData.originalIssue,
            adapters: issueData.adapters.sort(),
            issueNumber: issueData.issueNumber,
        };

        switch (issueData.severity) {
            case 'E':
                errors.push(item);
                break;
            case 'W':
                warnings.push(item);
                break;
            case 'S':
                suggestions.push(item);
                break;
        }
    }

    // Sort by issue number within each category
    errors.sort((a, b) => a.issueNumber - b.issueNumber);
    warnings.sort((a, b) => a.issueNumber - b.issueNumber);
    suggestions.sort((a, b) => a.issueNumber - b.issueNumber);

    // Generate markdown
    let markdown = '# Statistics Report\n\n';
    markdown += `*Generated on: ${new Date().toISOString()}*\n\n`;

    // Errors section
    markdown += '## ERRORS\n\n';
    for (const error of errors) {
        markdown += `### ${error.message}\n`;
        markdown += `${error.adapters.join('\n')}\n\n`;
    }

    // Warnings section
    markdown += '## WARNINGS\n\n';
    for (const warning of warnings) {
        markdown += `### ${warning.message}\n`;
        markdown += `${warning.adapters.join('\n')}\n\n`;
    }

    // Suggestions section
    markdown += '## SUGGESTIONS\n\n';
    for (const suggestion of suggestions) {
        markdown += `### ${suggestion.message}\n`;
        markdown += `${suggestion.adapters.join('\n')}\n\n`;
    }

    return markdown;
}

/**
 * Main function
 */
function main() {
    try {
        console.log('Reading statistics files...');
        const aggregatedIssues = readStatisticsFiles();

        console.log('Generating markdown report...');
        const markdownReport = generateMarkdownReport(aggregatedIssues);

        const outputPath = path.join(__dirname, '..', 'statisticsReport.md');
        fs.writeFileSync(outputPath, markdownReport, 'utf8');

        console.log(`Statistics report generated: ${outputPath}`);

        // Print summary
        const totalIssues = Object.keys(aggregatedIssues).length;
        console.log(`Total unique issues processed: ${totalIssues}`);
    } catch (error) {
        console.error('Error generating statistics report:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
