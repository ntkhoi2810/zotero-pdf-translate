import { getResponsivePopupWidth } from "../src/modules/readerPopupStyles";

describe("Reader popup responsive sizing", function () {
  it("caps vocabulary popups on wide readers", function () {
    assert.equal(getResponsivePopupWidth(1440), 440);
    assert.equal(getResponsivePopupWidth(800), 440);
  });

  it("shrinks with the reader viewport", function () {
    assert.equal(getResponsivePopupWidth(400), 376);
    assert.equal(getResponsivePopupWidth(300), 280);
    assert.equal(getResponsivePopupWidth(240), 224);
  });

  it("never returns a negative width", function () {
    assert.equal(getResponsivePopupWidth(0), 0);
  });
});
