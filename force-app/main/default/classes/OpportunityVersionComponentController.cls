public with sharing class OpportunityVersionComponentController {
    
    @AuraEnabled(cacheable=true)
    public static String getOpportunityStage(Id opportunityId) {
        if (opportunityId == null) {
            throw new AuraHandledException('Opportunity ID is required.');
        }

        Opportunity opp = [SELECT StageName FROM Opportunity WHERE Id = :opportunityId LIMIT 1];
        return opp.StageName;
    }

    
    @AuraEnabled(cacheable=false)
    public static List<Opportunity_Version__c> getRelatedOpportunityVersions(Id opportunityId) {
        return [
            SELECT Id, Name, Version_Name__c, Type__c, Syncing__c, Status__c, Total_Price__c, Total_Hours__c, Total_Cost__c, Number_of_Opportunity_Version_Line_Items__c, Opportunity__c
            FROM Opportunity_Version__c
            WHERE Opportunity__c = :opportunityId
            ORDER BY CreatedDate DESC
        ];
    }    

    @AuraEnabled(cacheable=false)
    public static List<Opportunity_Version_Line_Item__c> getOpportunityVersionLineItems(Id versionId) {
        return [
            SELECT Id, Name, Opportunity_Version__c, Team__c, Team_Name__c, Price__c, Hours__c, Cost__c, Pricing_Complete__c
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

    // CREATE Version
    @AuraEnabled
    public static Id createVersion(Id opportunityId, String versionName, String type, List<Map<String, Object>> newLineItems) {
        if (opportunityId == null || String.isBlank(versionName)) {
            throw new AuraHandledException('Opportunity ID and Version Name are required for Version creation.');
        }

        Savepoint sp = Database.setSavepoint(); // Set savepoint for rollback

        try {
            // Create the Version
            Opportunity_Version__c newVersion = new Opportunity_Version__c(
                Opportunity__c = opportunityId,
                Version_Name__c = versionName,
                Status__c = 'Draft',
                Type__c = type
            );
            insert newVersion;

            // If line items are provided, create them and associate with the Version
            if (newLineItems != null && !newLineItems.isEmpty()) {
                // Add VersionId to each line item map
                for (Map<String, Object> item : newLineItems) {
                    item.put('VersionId', newVersion.Id);
                }
                createVersionLineItems(newLineItems);
            }

            return newVersion.Id; // Return the newly created Version ID
        } catch (Exception e) {
            Database.rollback(sp); // Rollback transaction on error
            throw new AuraHandledException('Failed to create Version: ' + e.getMessage());
        }
    }

    // UPDATE Version
    @AuraEnabled
    public static void updateVersionStatus(Id versionId, String status) {
        if (versionId == null) {
            throw new AuraHandledException('Version ID is required.');
        }
    
        Opportunity_Version__c versionToUpdate = [SELECT Id, Opportunity__c, Version_Name__c, Status__c  FROM Opportunity_Version__c WHERE Id = :versionId LIMIT 1];
        versionToUpdate.Status__c = status;
        update versionToUpdate;
    }

    // DELETE Version
    @AuraEnabled
    public static void deleteVersion(Id versionId) {
        if (versionId == null) {
            throw new AuraHandledException('Version ID is required.');
        }
    
        try {
            delete [SELECT Id FROM Opportunity_Version__c WHERE Id = :versionId LIMIT 1];
        } catch (Exception e) {
            throw new AuraHandledException('Failed to delete Version: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static void manageVersionLineItems(
        List<Map<String, Object>> newLineItems,
        List<Map<String, Object>> updatedLineItems,
        List<Id> deletedLineItemIds
    ) {
        try {
            System.debug('Managing Version Line Items');
            System.debug('New Line Items: ' + newLineItems);
            System.debug('Updated Line Items: ' + updatedLineItems);
            System.debug('Deleted Line Item IDs: ' + deletedLineItemIds);
    
            if (newLineItems != null && !newLineItems.isEmpty()) {
                createVersionLineItems(newLineItems);
            }
    
            if (updatedLineItems != null && !updatedLineItems.isEmpty()) {
                updateVersionLineItems(updatedLineItems);
            }
    
            if (deletedLineItemIds != null && !deletedLineItemIds.isEmpty()) {
                deleteVersionLineItems(deletedLineItemIds);
            }
        } catch (Exception e) {
            System.debug('Error managing Version Line Items: ' + e.getMessage());
            throw new AuraHandledException('Error managing Version Line Items: ' + e.getMessage());
        }
    }

    // CREATE VersionLineItems
    @AuraEnabled
    public static void createVersionLineItems(List<Map<String, Object>> newLineItems) {
        if (newLineItems == null || newLineItems.isEmpty()) {
            throw new AuraHandledException('No new line items provided for creation.');
        }
    
        System.debug('Creating Version Line Items: ' + newLineItems);
    
        List<Opportunity_Version_Line_Item__c> recordsToInsert = new List<Opportunity_Version_Line_Item__c>();
    
        for (Map<String, Object> item : newLineItems) {
            if (item.get('Team__c') == null) {
                throw new AuraHandledException('Team__c value is required for new line items.');
            }
            if (item.get('VersionId') == null) {
                throw new AuraHandledException('VersionId is required for new line items.');
            }
    
            Decimal hours = item.get('Hours__c') != null ? (Decimal)item.get('Hours__c') : 0;
            Decimal price = item.get('Price__c') != null ? (Decimal)item.get('Price__c') : 0;
            Decimal cost = item.get('Cost__c') != null ? (Decimal)item.get('Cost__c') : 0;
            Boolean pricingComplete = item.get('Pricing_Complete__c') != null ? (Boolean)item.get('Pricing_Complete__c') : false;

            recordsToInsert.add(new Opportunity_Version_Line_Item__c(
                Opportunity_Version__c = (Id)item.get('VersionId'),
                Team__c = (Id)item.get('Team__c'),
                Hours__c = hours,
                Price__c = price,
                Cost__c = cost,
                Pricing_Complete__c = pricingComplete // Ensure Pricing_Complete__c is included
            ));
        }
    
        try {
            insert recordsToInsert;
            System.debug('Successfully created Version Line Items');
        } catch (Exception e) {
            System.debug('Error creating Version Line Items: ' + e.getMessage());
            throw new AuraHandledException('Failed to create Version Line Items: ' + e.getMessage());
        }
    }

    // UPDATE VersionLineItems
    @AuraEnabled
    public static void updateVersionLineItems(List<Map<String, Object>> updatedLineItems) {
        if (updatedLineItems == null || updatedLineItems.isEmpty()) {
            throw new AuraHandledException('No line items provided for update.');
        }

        List<Opportunity_Version_Line_Item__c> recordsToUpdate = new List<Opportunity_Version_Line_Item__c>();

        for (Map<String, Object> item : updatedLineItems) {
            if (item.get('Id') == null) {
                throw new AuraHandledException('Version Line Item ID is required for update.');
            }

            Decimal hours = item.get('Hours__c') != null ? (Decimal)item.get('Hours__c') : 0;
            Decimal unitPrice = item.get('Price__c') != null ? (Decimal)item.get('Price__c') : 0;
            Decimal cost = item.get('Cost__c') != null ? (Decimal)item.get('Cost__c') : 0;

            recordsToUpdate.add(new Opportunity_Version_Line_Item__c(
                Id = (Id)item.get('Id'),
                Team__c = (Id)item.get('Team__c'),
                Hours__c = hours,
                Price__c = unitPrice,
                Cost__c = cost
            ));
        }

        try {
            update recordsToUpdate;
        } catch (Exception e) {
            throw new AuraHandledException('Failed to update Version Line Items: ' + e.getMessage());
        }
    }

    // DELETE VersionLineItems
    @AuraEnabled
    public static void deleteVersionLineItems(List<Id> deletedLineItemIds) {
        if (deletedLineItemIds == null || deletedLineItemIds.isEmpty()) {
            throw new AuraHandledException('No line item IDs provided for deletion.');
        }

        try {
            delete [SELECT Id FROM Opportunity_Version_Line_Item__c WHERE Id IN :deletedLineItemIds];
        } catch (Exception e) {
            throw new AuraHandledException('Failed to delete Version Line Items: ' + e.getMessage());
        }
    }

}