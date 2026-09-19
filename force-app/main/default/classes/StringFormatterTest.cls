@isTest
private class StringFormatterTest {
    @isTest
    static void testToUpperCaseTrimmed() {
        String result = StringFormatter.toUpperCaseTrimmed('  hello world  ');
        System.assertEquals('HELLO WORLD', result, 'Should trim and uppercase');
        System.assertEquals('', StringFormatter.toUpperCaseTrimmed(null), 'Null should return empty string');
    }

    @isTest
    static void testIsEmailFormat() {
        System.assertEquals(true, StringFormatter.isEmailFormat('test@example.com'), 'Valid email format');
        System.assertEquals(false, StringFormatter.isEmailFormat('invalid-email'), 'Invalid email format');
        System.assertEquals(false, StringFormatter.isEmailFormat(''), 'Empty string is invalid');
    }
}
