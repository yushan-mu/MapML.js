// Generated by Selenium IDE
const { Builder, By, Key, until } = require('selenium-webdriver')
const assert = require('assert')



describe('ChromeTest', function() {
  this.timeout(30000)
  let driver
  let vars
  beforeEach(async function() {
    driver = await new Builder().forBrowser('chrome').build()
    vars = {}
  })
  afterEach(async function() {
    await driver.quit();
  })
  it('Test1', async function() {
    // Test name: Test1
    // Step # | name | target | value
    // 1 | setWindowSize | 1024x768 | 
    await driver.manage().window().setRect({ width: 1024, height: 768 })
    // 2 | open | /geoserver/mapml/topp:states/osmtile/ | 
    await driver.get("http://localhost:8383/Web-Map-Custom-Element/index.html")
    // 3 | click | linkText=+ | 
    // 
    // zoom in
    {
      const element = await driver.findElement(By.css("map > div"))
      await driver.actions({ bridge: true}).doubleClick(element).perform()
    }
  
  })
})