public with sharing class AccountHelper {
    public static String generateAccountReference(String accountName) {
        if (String.isBlank(accountName)) {
            return 'ACC-UNKNOWN';
        }
        return 'ACC-' + accountName.replaceAll('\\s+', '-').toUpperCase();
    }

    public static Boolean isValidRating(String rating) {
        Set<String> validRatings = new Set<String>{'Hot', 'Warm', 'Cold'};
        return validRatings.contains(rating);
    }
}
