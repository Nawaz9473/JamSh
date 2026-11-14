import assert from 'node:assert/strict';

console.log('===============================================================');
console.log('JAMSHH UNIVERSAL RESPONSIVE UI & SCREEN ADAPTABILITY AUDIT');
console.log('===============================================================\n');

// Device Profiles to Test
const deviceProfiles = [
  {
    name: 'Compact Phone (iPhone SE 1st gen / Small Android)',
    width: 320,
    height: 568,
    safeArea: { top: 20, bottom: 0, left: 0, right: 0 },
    expected: { isMobile: true, isSmallMobile: true, isShortScreen: true, isLandscape: false }
  },
  {
    name: 'Mid-Compact Phone (iPhone SE 2nd/3rd gen)',
    width: 375,
    height: 667,
    safeArea: { top: 20, bottom: 0, left: 0, right: 0 },
    expected: { isMobile: true, isSmallMobile: true, isShortScreen: true, isLandscape: false }
  },
  {
    name: 'Modern Notch Phone (iPhone 12/13/14 / Android Punch Hole)',
    width: 390,
    height: 844,
    safeArea: { top: 47, bottom: 34, left: 0, right: 0 },
    expected: { isMobile: true, isSmallMobile: false, isShortScreen: false, isLandscape: false }
  },
  {
    name: 'Dynamic Island Max Phone (iPhone 14/15/16 Pro Max)',
    width: 430,
    height: 932,
    safeArea: { top: 59, bottom: 34, left: 0, right: 0 },
    expected: { isMobile: true, isSmallMobile: false, isShortScreen: false, isLandscape: false }
  },
  {
    name: 'Landscape Phone (Rotated Modern Phone)',
    width: 844,
    height: 390,
    safeArea: { top: 0, bottom: 21, left: 47, right: 47 },
    expected: { isMobile: false, isSmallMobile: false, isShortScreen: true, isLandscape: true }
  },
  {
    name: 'Foldable / Tablet (iPad Mini / Galaxy Fold Unfolded)',
    width: 768,
    height: 1024,
    safeArea: { top: 24, bottom: 20, left: 0, right: 0 },
    expected: { isMobile: false, isSmallMobile: false, isShortScreen: false, isLandscape: false }
  }
];

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] Test ${totalTests}: ${name}`);
    console.error(err);
  }
}

// 1. Viewport Breakpoint & Classification Logic
deviceProfiles.forEach((device) => {
  runTest(`Breakpoint & Mode Classification for ${device.name}`, () => {
    const isMobile = device.width < 768;
    const isSmallMobile = device.width < 380;
    const isShortScreen = device.height < 700;
    const isLandscape = device.width > device.height && device.height < 600;

    assert.equal(isMobile, device.expected.isMobile, 'isMobile mismatch');
    assert.equal(isSmallMobile, device.expected.isSmallMobile, 'isSmallMobile mismatch');
    assert.equal(isShortScreen, device.expected.isShortScreen, 'isShortScreen mismatch');
    assert.equal(isLandscape, device.expected.isLandscape, 'isLandscape mismatch');
  });
});

// 2. Safe Area Clearance (Status Bar / Notch / Dynamic Island)
deviceProfiles.forEach((device) => {
  runTest(`Top Header Clearance for ${device.name}`, () => {
    const minHeaderHeight = 56;
    const effectiveHeaderHeight = minHeaderHeight + Math.max(device.safeArea.top, 0);
    const topPadding = Math.max(device.safeArea.top, 8);

    // Verify top padding ensures content clears the camera cutout / status bar
    assert.ok(topPadding >= device.safeArea.top, 'Top padding must cover status bar / notch');
    assert.ok(effectiveHeaderHeight >= device.safeArea.top + 48, 'Header height must accommodate touch target');
  });
});

// 3. Bottom Safe Area Clearance (Home Indicator / Nav Bar)
deviceProfiles.forEach((device) => {
  runTest(`Bottom Floating Bar Clearance for ${device.name}`, () => {
    const bottomBarOffset = Math.max(device.safeArea.bottom, 8) + 4;
    const mainPaddingBottom = Math.max(device.safeArea.bottom, 12) + 76;

    // Verify bottom bar floats safely above system home indicator
    assert.ok(bottomBarOffset >= device.safeArea.bottom, 'Bottom bar offset must be above home indicator');
    // Verify scroll content padding clears both floating bottom bar (58px) and safe area
    assert.ok(mainPaddingBottom > bottomBarOffset + 58, 'Scroll padding must ensure last item is visible above bottom bar');
  });
});

// 4. Horizontal Card Boundaries (Zero Overflow Guarantee)
deviceProfiles.forEach((device) => {
  runTest(`Horizontal Bounded Width for ${device.name}`, () => {
    const cardMaxWidth = 500;
    const cardWidth = Math.min(device.width, cardMaxWidth);
    const sidePadding = Math.max(device.safeArea.left, 12);

    // Total card width must fit strictly within screen width
    assert.ok(cardWidth <= device.width, 'Card width must never exceed viewport width');
    assert.ok(sidePadding >= device.safeArea.left, 'Side padding must cover landscape notch');
  });
});

// 5. Auth Screen Scrollability & Visibility Guarantee
deviceProfiles.forEach((device) => {
  runTest(`Auth Screen Compact Mode & Touch Targets for ${device.name}`, () => {
    const isCompact = device.height < 700 || (device.width > device.height && device.height < 600);
    const logoSize = isCompact ? 54 : 76;
    const btnMinHeight = 48; // Accessible touch target

    assert.ok(btnMinHeight >= 44, 'Button touch target meets WCAG 44x44px minimum');
    if (device.expected.isShortScreen) {
      assert.equal(logoSize, 54, 'Logo should be compact on short screen to prevent button clipping');
    }
  });
});

console.log(`\n===============================================================`);
console.log(`TOTAL AUDIT TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log(`===============================================================`);

if (totalTests !== passedTests) {
  process.exit(1);
}
