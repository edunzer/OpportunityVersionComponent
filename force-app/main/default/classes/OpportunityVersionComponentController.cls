public with sharing class OpportunityVersionComponentController {
    
    @AuraEnabled(cacheable=false)
    public static List<Opportunity_Version__c> getRelatedOpportunityVersions(Id opportunityId) {
        return [
            SELECT Id, Name, Syncing__c, Status__c, Total_Price__c, Total_Hours__c, Total_Cost__c, 	Number_of_Opportunity_Version_Line_Items__c, Opportunity__c
            FROM Opportunity_Version__c
            WHERE Opportunity__c = :opportunityId
            ORDER BY CreatedDate DESC
        ];
    }    

    @AuraEnabled(cacheable=false)
    public static List<Opportunity_Version_Line_Item__c> getOpportunityVersionLineItems(Id versionId) {
        return [
            SELECT Id, Name, Opportunity_Version__c, Team__c, Team_Name__c, Price__c, Hours__c, Cost__c
            FROM Opportunity_Version_Line_Item__c
            WHERE Opportunity_Version__c = :versionId
            ORDER BY Team__c
        ];
    }

    @AuraEnabled(cacheable=true)
    public static List<PricebookEntry> getActiveProductsFromPriceBook(Id opportunityId) {
        Opportunity opp = [SELECT Pricebook2Id FROM Opportunity WHERE Id = :opportunityId LIMIT 1];
        if (opp.Pricebook2Id == null) {
            throw new AuraHandledException('No Pricebook associated with the Opportunity.');
        }
        return [
            SELECT Id, Product2Id, Product2.Name, UnitPrice
            FROM PricebookEntry
            WHERE Pricebook2Id = :opp.Pricebook2Id
            AND IsActive = true
        ];
    } 

}