@isTest
private class AccountHelperTest {
    @isTest
    static void testGenerateAccountReference() {
        String ref = AccountHelper.generateAccountReference('Acme Corp');
        System.assertEquals('ACC-ACME-CORP', ref, 'Reference should be formatted properly');
        System.assertEquals('ACC-UNKNOWN', AccountHelper.generateAccountReference(''), 'Blank name returns fallback');
    }

    @isTest
    static void testIsValidRating() {
        System.assertEquals(true, AccountHelper.isValidRating('Hot'), 'Hot should be valid');
        System.assertEquals(false, AccountHelper.isValidRating('SuperHot'), 'Invalid rating should return false');
    }
}
