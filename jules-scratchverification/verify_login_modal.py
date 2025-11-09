from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Navigate to the local server
        page.goto("http://localhost:8000/Index.html")

        # Open the login modal
        page.click('#login-btn')

        # Wait for a short period to allow the modal to appear
        time.sleep(1)

        # Take a screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")

        browser.close()

if __name__ == "__main__":
    run()
