/**
 * Compares the current site structure with a previous snapshot
 * @param path Path to the snapshot file to compare against
 * @param url URL of the site to crawl and compare
 */
import type { Page } from './snapshot';
import { getPageHTML, getPageTitle } from './utils';
import * as cheerio from 'cheerio';

function encodeUrl(baseUrl: string, url: string) {
    // strip / from end of base url
    const baseUrlWithoutTrailingSlash = baseUrl.replace(/\/$/, '');
    // encode url
    const encodedUrl = baseUrlWithoutTrailingSlash + url;
    return encodedUrl;
}

export async function compareSnapshots(path: string, baseUrl: string): Promise<Set<string>[]> {
    let snapshot = await Bun.file(path).json();
    const pagesToCheck: Page[] = []
    const missingPages = new Set<string>();
    const pagesWithDiffTitle = new Set<string>();
    pagesToCheck.push(snapshot);

    let curPage;
    while (curPage = pagesToCheck.pop()) {
        const fullUrl = encodeUrl(baseUrl, curPage.url);
        console.log(`Checking page: ${fullUrl}`);
        
        if (curPage.children) {
            console.log(`Found ${curPage.children.length} child pages to process`);
            pagesToCheck.push(...(curPage.children as Page[]))
        }
        
        let pageHTML;
        try {
            console.time(`fetch-${fullUrl}`);
            pageHTML = await getPageHTML(fullUrl);
            if (!pageHTML) {
                throw new Error('Page not found (404)');
            }
            console.timeEnd(`fetch-${fullUrl}`);
        } catch (error: any) {
            console.error(`Failed to fetch ${fullUrl}:`, error.message);
            missingPages.add(fullUrl);
            console.log(`Added ${fullUrl} to missing pages list`);
            continue;
        }
        
        console.time(`parse-${fullUrl}`);
        const $ = cheerio.load(pageHTML);
        console.timeEnd(`parse-${fullUrl}`);
        
        // Update title for the current URL in the tree
        const title = getPageTitle($);
        console.log(`Page title: "${title}", Expected: "${curPage.title}"`);
        
        if (title !== curPage.title) {
            pagesWithDiffTitle.add(fullUrl);
            console.log(`Added ${fullUrl} to pages with different titles`);
        }
    }
    return [missingPages, pagesWithDiffTitle]
}

async function main() {
    const args = process.argv.slice(2);
    const pathIndex = args.indexOf('--path');
    const urlIndex = args.indexOf('--url');

    if (pathIndex === -1 || urlIndex === -1) {
        console.error('Usage: bun run diff.ts --path <snapshot-path> --url <url>');
        process.exit(1);
    }

    const path = args[pathIndex + 1];
    const url = args[urlIndex + 1];

    if (!path || !url) {
        console.error('Both --path and --url require values');
        process.exit(1);
    }

    const [missingPages, pagesWithDiffTitle] = await compareSnapshots(path, url);
    console.log(missingPages, pagesWithDiffTitle)
}

if (import.meta.main) {
    main().catch((error) => {
        console.error('Error:', error);
        process.exit(1);
    });
}

