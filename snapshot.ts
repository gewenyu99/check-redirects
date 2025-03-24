const baseURL = "https://docs.trunk.io/"
import * as cheerio from 'cheerio';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sleep } from 'bun';
import { urlId, getGitShortHash } from './utils';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || "https://docs.trunk.io";
const RATE_LIMIT_DELAY = parseInt(process.env.RATE_LIMIT_DELAY || "50");
const MAX_DEPTH = process.env.MAX_DEPTH || 5;

// Queue class for BFS traversal
type URLItem = {
    url: string;
    depth: number;
}
class Queue {
    private items: URLItem[];

    constructor() {
        this.items = [];
    }
    
    enqueue(item: URLItem) {
        this.items.push(item);
    }
    
    dequeue() {
        return this.items.shift();
    }
    
    isEmpty() {
        return this.items.length === 0;
    }
}


async function crawlSite(baseURL: string, rateLimitDelay: number, maxDepth: number) {
    const visitedUrls = new Set();
    const urlToParent = new Map();  // Keep track of parent-child relationships
    const queue = new Queue();
    const siteTree = {
        url: baseURL,
        title: '',
        children: []
    };
    
    // Start with the base URL
    queue.enqueue({ url: baseURL, depth: 0 });
    visitedUrls.add(baseURL);
    
    while (!queue.isEmpty()) {
        const item = queue.dequeue();
        if (!item) {
            continue;
        }
        const { url, depth } = item;
        
        if (depth > maxDepth) {  // Max depth of 5
            continue;
        }
        
        try {
            // Rate limiting
            await sleep(rateLimitDelay);
            
            console.log(`Crawling ${url} (depth: ${depth})`);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const html = await response.text();
            const $ = cheerio.load(html);
            
            // Update title for the current URL in the tree
            const title = $('title').text().trim();
            if (url === baseURL) {
                siteTree.title = title;
            }
            
            // Find all navigation links
            $('a[href]').each((i, element) => {
                const href = $(element).attr('href');
                const text = $(element).text().trim();
                
                // Skip empty links, external links, and anchor links
                if (!href || !text || 
                    href.startsWith('http') || 
                    href.startsWith('#') ||
                    href.startsWith('mailto:') ||
                    href.startsWith('tel:')) {
                    return;
                }
                
                try {
                    const fullUrl = new URL(href, url).toString();
                    if (fullUrl.startsWith(baseURL) && !visitedUrls.has(fullUrl)) {
                        visitedUrls.add(fullUrl);
                        queue.enqueue({ url: fullUrl, depth: depth + 1 });
                        
                        // Store the parent-child relationship
                        urlToParent.set(fullUrl, {
                            parentUrl: url,
                            nodeInfo: {
                                url: fullUrl,
                                title: text,
                                children: []
                            }
                        });
                    }
                } catch (e) {
                    console.warn(`Invalid URL: ${href} on page ${url}`);
                }
            });
            
        } catch (error) {
            console.error(`Error crawling ${url}:`, error.message);
        }
    }
    
    // Build the tree structure from the collected relationships
    for (const [url, { parentUrl, nodeInfo }] of urlToParent.entries()) {
        const parentNode = parentUrl === baseURL ? siteTree : urlToParent.get(parentUrl)?.nodeInfo;
        if (parentNode) {
            parentNode.children.push(nodeInfo);
        }
    }
    
    return siteTree;
}

async function main() {
    try {
        console.log('Starting to crawl docs.trunk.io...');
        const navTree = await crawlSite(BASE_URL, RATE_LIMIT_DELAY, MAX_DEPTH);
        
        // Create output directory if it doesn't exist
        const outputDir = path.join(__dirname, 'snapshots');
        await fs.mkdir(outputDir, { recursive: true });
        
        // Write the navigation tree to a JSON file
        const outputPath = path.join(outputDir, `${urlId(baseURL)}-${getGitShortHash()}.json`);
        await fs.writeFile(outputPath, JSON.stringify(navTree, null, 2));
        
        console.log(`Navigation tree has been saved to ${outputPath}`);
    } catch (error) {
        console.error('Error in main:', error);
        process.exit(1);
    }
}

// main();

console.log(`${urlId(baseURL)}-${await getGitShortHash()}.json`); 