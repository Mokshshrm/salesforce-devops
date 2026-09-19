public with sharing class StringFormatter {
    public static String toUpperCaseTrimmed(String input) {
        if (String.isBlank(input)) {
            return '';
        }
        return input.trim().toUpperCase();
    }

    public static Boolean isEmailFormat(String email) {
        if (String.isBlank(email)) {
            return false;
        }
        return email.contains('@') && email.contains('.');
    }
}
