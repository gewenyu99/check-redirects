import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';
import { sleep } from 'bun';
import { mkdir } from "node:fs/promises";
import { getPageHTML, urlId, getPageTitle } from './utils';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Queue class for BFS traversal
export type Page = {
    url: string,
    title: string,
    children: Page[],
    depth: number
}
class Queue {
    private items: Page[];

    constructor() {
        this.items = [];
    }
    
    enqueue(item: Page) {
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
    const queue = new Queue();
    const siteTree = {
        url: '/',
        title: '',
        children: [],
        depth: 0
    } as Page;
    
    // Start with the base URL
    queue.enqueue(siteTree);
    visitedUrls.add(baseURL);
    
    while (!queue.isEmpty()) {
        const page = queue.dequeue();
        if (!page) {
            continue;
        }
        const { url, depth } = page;
        
        if (depth > maxDepth) { 
            continue;
        }
        
        try {
            // Rate limiting
            await sleep(rateLimitDelay);
            
            console.log(`Crawling ${url} (depth: ${depth})`);

            const completeURL = new URL(url, baseURL).toString();

            const $ = cheerio.load(await getPageHTML(completeURL));
            
            if (completeURL === baseURL) {
                siteTree.title = getPageTitle($);
            }
            page.title = getPageTitle($);
            
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
                    const fullUrl = new URL(href, completeURL).toString();
                    if (fullUrl.startsWith(baseURL) && !visitedUrls.has(fullUrl)) {
                        visitedUrls.add(fullUrl);
                        const nextDepth = 1 + depth;
                        const childPage = {
                            url: href,
                            title: '',
                            children: [],
                            depth: nextDepth
                        } as Page;
                        queue.enqueue(childPage);
                        page.children.push(childPage);
                    }
                } catch (e) {
                    console.warn(`Invalid URL: ${href} on page ${url}`);
                }
            });
            
        } catch (error: any) {
            console.error(`Error crawling ${url}:`, error.message);
        }
    }
    
    return siteTree;
}

async function main() {
    const args = process.argv.slice(2);
    const urlIndex = args.indexOf('--url');
    const rateLimitIndex = args.indexOf('--rate-limit');
    const maxDepthIndex = args.indexOf('--max-depth');
    
    if (urlIndex === -1) {
        console.error('Usage: bun run snapshot.ts --url <url> [--rate-limit <ms>] [--max-depth <number>]');
        process.exit(1);
    }

    const url = args[urlIndex + 1];
    const rateLimitDelay = parseInt(args[rateLimitIndex + 1] ?? '50');
    const maxDepth = parseInt(args[maxDepthIndex + 1] ?? '5');

    if (!url) {
        console.error('--url requires a value');
        process.exit(1);
    }

    try {
        console.log(`Starting to crawl ${url}...`);
        const navTree = await crawlSite(new URL(url).toString(), rateLimitDelay, maxDepth);
        
        // Create output directory if it doesn't exist
        const outputDir = path.join(__dirname, 'snapshots');
        await mkdir(outputDir, { recursive: true });
        
        // Write the navigation tree to a JSON file
        const outputPath = path.join(outputDir, `${urlId(url)}.json`);
        await Bun.write(outputPath, JSON.stringify(navTree, null, 2));
        console.log(`Navigation tree has been saved to ${outputPath}`);
    } catch (error) {
        console.error('Error in main:', error);
        process.exit(1);
    }
}

if (import.meta.main) {
    main();
}

