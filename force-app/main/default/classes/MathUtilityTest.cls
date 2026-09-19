@isTest
private class MathUtilityTest {
    @isTest
    static void testAddNumbers() {
        Integer sum = MathUtility.addNumbers(10, 20);
        System.assertEquals(30, sum, 'Sum should be 30');
    }

    @isTest
    static void testMultiplyNumbers() {
        Integer product = MathUtility.multiplyNumbers(5, 6);
        System.assertEquals(30, product, 'Product should be 30');
    }
}
