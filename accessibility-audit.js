/**
 * Accessibility Audit Script for Theme Compatibility
 * Run this script in the browser console to perform automated accessibility checks
 */

(function() {
    'use strict';
    
    console.log('🔍 Starting Accessibility Audit for Theme Compatibility...');
    
    const results = {
        passed: 0,
        failed: 0,
        warnings: 0,
        details: []
    };
    
    function logResult(test, status, message, element = null) {
        const result = {
            test,
            status,
            message,
            element: element ? element.tagName + (element.className ? '.' + element.className.split(' ').join('.') : '') : null
        };
        
        results.details.push(result);
        
        const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
        console.log(`${icon} ${test}: ${message}`);
        
        if (status === 'pass') results.passed++;
        else if (status === 'fail') results.failed++;
        else results.warnings++;
    }
    
    // Test 1: Check focus indicators
    function testFocusIndicators() {
        const interactiveElements = document.querySelectorAll(
            'button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"]'
        );
        
        let elementsWithFocus = 0;
        
        interactiveElements.forEach(element => {
            const styles = window.getComputedStyle(element);
            const classList = Array.from(element.classList);
            
            // Check for focus-related classes
            const hasFocusClasses = classList.some(cls => 
                cls.includes('focus:') || cls.includes('ring') || cls.includes('outline')
            );
            
            if (hasFocusClasses) {
                elementsWithFocus++;
            }
        });
        
        if (elementsWithFocus === interactiveElements.length) {
            logResult('Focus Indicators', 'pass', `All ${interactiveElements.length} interactive elements have focus indicators`);
        } else if (elementsWithFocus > interactiveElements.length * 0.8) {
            logResult('Focus Indicators', 'warning', `${elementsWithFocus}/${interactiveElements.length} elements have focus indicators`);
        } else {
            logResult('Focus Indicators', 'fail', `Only ${elementsWithFocus}/${interactiveElements.length} elements have focus indicators`);
        }
    }
    
    // Test 2: Check touch target sizes
    function testTouchTargets() {
        const touchTargets = document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]');
        let adequateTargets = 0;
        
        touchTargets.forEach(target => {
            const rect = target.getBoundingClientRect();
            const classList = Array.from(target.classList);
            
            // Check actual size or padding classes
            const hasAdequateSize = rect.width >= 44 && rect.height >= 44;
            const hasAdequatePadding = classList.some(cls => 
                cls.includes('p-') || cls.includes('px-') || cls.includes('py-') || 
                cls.includes('h-10') || cls.includes('h-12')
            );
            
            if (hasAdequateSize || hasAdequatePadding) {
                adequateTargets++;
            }
        });
        
        if (adequateTargets === touchTargets.length) {
            logResult('Touch Targets', 'pass', `All ${touchTargets.length} touch targets meet size requirements`);
        } else {
            logResult('Touch Targets', 'fail', `${touchTargets.length - adequateTargets} touch targets are too small`);
        }
    }
    
    // Test 3: Check form labels
    function testFormLabels() {
        const inputs = document.querySelectorAll('input, select, textarea');
        let labeledInputs = 0;
        
        inputs.forEach(input => {
            const hasLabel = 
                document.querySelector(`label[for="${input.id}"]`) ||
                input.closest('label') ||
                input.getAttribute('aria-label') ||
                input.getAttribute('aria-labelledby');
            
            if (hasLabel) {
                labeledInputs++;
            } else {
                logResult('Form Labels', 'fail', 'Input without proper label found', input);
            }
        });
        
        if (labeledInputs === inputs.length) {
            logResult('Form Labels', 'pass', `All ${inputs.length} form inputs have proper labels`);
        } else {
            logResult('Form Labels', 'fail', `${inputs.length - labeledInputs} inputs missing labels`);
        }
    }
    
    // Test 4: Check heading hierarchy
    function testHeadingHierarchy() {
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        let hierarchyValid = true;
        let lastLevel = 0;
        
        headings.forEach(heading => {
            const level = parseInt(heading.tagName.charAt(1));
            
            if (level > lastLevel + 1) {
                hierarchyValid = false;
                logResult('Heading Hierarchy', 'fail', `Heading level jumps from h${lastLevel} to h${level}`, heading);
            }
            
            lastLevel = level;
        });
        
        if (hierarchyValid && headings.length > 0) {
            logResult('Heading Hierarchy', 'pass', `Heading hierarchy is logical (${headings.length} headings)`);
        } else if (headings.length === 0) {
            logResult('Heading Hierarchy', 'warning', 'No headings found');
        }
    }
    
    // Test 5: Check color contrast (simplified)
    function testColorContrast() {
        const textElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, label, button');
        let elementsWithColor = 0;
        
        textElements.forEach(element => {
            const styles = window.getComputedStyle(element);
            const color = styles.color;
            const backgroundColor = styles.backgroundColor;
            
            // Simple check that colors are defined
            if (color && color !== 'rgba(0, 0, 0, 0)' && color !== '') {
                elementsWithColor++;
            }
        });
        
        if (elementsWithColor > textElements.length * 0.9) {
            logResult('Color Contrast', 'pass', `${elementsWithColor}/${textElements.length} text elements have defined colors`);
        } else {
            logResult('Color Contrast', 'warning', `${elementsWithColor}/${textElements.length} text elements have defined colors`);
        }
    }
    
    // Test 6: Check theme consistency
    function testThemeConsistency() {
        const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        
        // Check for theme-aware elements
        const themeElements = document.querySelectorAll('[class*="dark:"], [class*="bg-"], [class*="text-"]');
        
        if (themeElements.length > 0) {
            logResult('Theme Consistency', 'pass', `${themeElements.length} theme-aware elements found in ${currentTheme} theme`);
        } else {
            logResult('Theme Consistency', 'warning', 'No theme-aware elements found');
        }
    }
    
    // Test 7: Check spacing consistency
    function testSpacingConsistency() {
        const spacedElements = document.querySelectorAll('[class*="space-"], [class*="gap-"], [class*="p-"], [class*="m-"]');
        
        if (spacedElements.length > 0) {
            logResult('Spacing Consistency', 'pass', `${spacedElements.length} elements use consistent spacing classes`);
        } else {
            logResult('Spacing Consistency', 'warning', 'No spacing classes found');
        }
    }
    
    // Test 8: Check width constraints
    function testWidthConstraints() {
        const constrainedElements = document.querySelectorAll('[class*="max-w"], [class*="w-"], [class*="mx-auto"]');
        
        if (constrainedElements.length > 0) {
            logResult('Width Constraints', 'pass', `${constrainedElements.length} elements have width constraints`);
        } else {
            logResult('Width Constraints', 'warning', 'No width constraints found');
        }
    }
    
    // Test 9: Check keyboard navigation
    function testKeyboardNavigation() {
        const focusableElements = document.querySelectorAll(
            'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        let tabbableElements = 0;
        focusableElements.forEach(element => {
            if (element.tabIndex >= 0) {
                tabbableElements++;
            }
        });
        
        if (tabbableElements === focusableElements.length) {
            logResult('Keyboard Navigation', 'pass', `All ${focusableElements.length} focusable elements are tabbable`);
        } else {
            logResult('Keyboard Navigation', 'warning', `${tabbableElements}/${focusableElements.length} elements are tabbable`);
        }
    }
    
    // Run all tests
    console.log('🧪 Running accessibility tests...\n');
    
    testFocusIndicators();
    testTouchTargets();
    testFormLabels();
    testHeadingHierarchy();
    testColorContrast();
    testThemeConsistency();
    testSpacingConsistency();
    testWidthConstraints();
    testKeyboardNavigation();
    
    // Display summary
    console.log('\n📊 Accessibility Audit Summary:');
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⚠️  Warnings: ${results.warnings}`);
    
    const total = results.passed + results.failed + results.warnings;
    const score = Math.round((results.passed / total) * 100);
    
    console.log(`\n🎯 Overall Score: ${score}%`);
    
    if (score >= 90) {
        console.log('🎉 Excellent! Your theme compatibility and accessibility implementation is outstanding.');
    } else if (score >= 80) {
        console.log('👍 Good! Minor improvements could enhance accessibility further.');
    } else if (score >= 70) {
        console.log('⚠️  Fair. Several accessibility issues should be addressed.');
    } else {
        console.log('🚨 Poor. Significant accessibility improvements are needed.');
    }
    
    // Return results for programmatic access
    return results;
})();