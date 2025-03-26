import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

export function urlId(baseURL: string): string {
    baseURL = baseURL.replace(/^\/|\/$/g, '');
    return baseURL.replace(/https:\/\//g, '').replace(/\//g, '_');
}

export async function getPageHTML(url: string) {
    const browser = await puppeteer.launch();
    try {
        const page = await browser.newPage();
        const response = await page.goto(url, { waitUntil: 'load' });
        
        // Get the HTML content
        const html = await page.content();
        
        // Check for 404 by looking at the rendered content
        const notFoundH2 = await page.$eval('h2', el => el.textContent).catch(() => null);
        console.log(notFoundH2);
        if (notFoundH2?.includes('Page not found')) {
            return null;
        }
        
        return html;
    } finally {
        await browser.close();
    }
}

export function getPageTitle($: cheerio.CheerioAPI) {
    const headerH1 = $('header h1').text().trim();            
    return headerH1;
}