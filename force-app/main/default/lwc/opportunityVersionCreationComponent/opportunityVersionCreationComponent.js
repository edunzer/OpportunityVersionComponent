import LightningModal from 'lightning/modal';
import { api, wire } from 'lwc';

import { publish, MessageContext } from 'lightning/messageService';
import OpportunityVersionRefreshChannel from '@salesforce/messageChannel/OpportunityVersionRefreshChannel__c';

import getRelatedOpportunityVersions from '@salesforce/apex/OpportunityVersionComponentController.getRelatedOpportunityVersions';
import getActiveProductsFromPriceBook from '@salesforce/apex/OpportunityVersionComponentController.getActiveProductsFromPriceBook';
import getOpportunityVersionLineItems from '@salesforce/apex/OpportunityVersionComponentController.getOpportunityVersionLineItems';
import getOpportunityStage from '@salesforce/apex/OpportunityVersionComponentController.getOpportunityStage';

import createVersion from '@salesforce/apex/OpportunityVersionComponentController.createVersion';

export default class OpportunityVersionCreationComponent extends LightningModal {
    @api opportunityId; // Opportunity ID passed from the parent component
    versionName = '';
    type = '';
    versionLineItems = [];
    products = [];
    isLoading = false;
    errorMessages = null; // To hold error messages for inline display

    @wire(MessageContext) messageContext; // Wire MessageContext for LMS

    connectedCallback() {
        console.log('Initializing Version Creation Component');
        this.isLoading = true;   
    
        this.determineVersionType()
            .then(() => this.generateVersionName())  // Ensure type is set before generating name
            .then(() => this.loadProducts())
            .then(() => this.loadSyncedVersionLineItems())
            .catch((error) => {
                console.error('Error during initialization:', error);
                this.setErrorMessage('Failed to initialize the version modal.');
            })
            .finally(() => {
                this.isLoading = false;
                console.log('Initialization complete');
            });
    }    

    determineVersionType() {
        console.log('Determining version type...');
        return getOpportunityStage({ opportunityId: this.opportunityId })
            .then((stageName) => {
                console.log('Retrieved Opportunity Stage:', stageName); // Log the retrieved stage
                this.type = stageName === '06-Closed Won' ? 'Post-Sale' : 'Pre-Sale';
                console.log('Determined version type:', this.type);
            })
            .catch((error) => {
                console.error('Error determining version type:', error);
                this.setErrorMessage('Failed to determine Version Type.');
            });
    }    

    // Generate Version Name
    generateVersionName() {
        console.log('Generating version name');
    
        return getRelatedOpportunityVersions({ opportunityId: this.opportunityId })
            .then((versions) => {
                const count = versions.length;
    
                // Filter versions where Type__c is 'Post-Sale'
                const postSaleVersions = versions.filter(version => version.Type__c === 'Post-Sale');
                const postSaleCount = postSaleVersions.length;
    
                let versionBaseName = `Version-${count + 1}`;
    
                // Append "Ch-{count}" only if it's Post-Sale
                if (this.type === 'Post-Sale') {
                    const chCount = postSaleCount > 0 ? postSaleCount + 1 : 1; // Ensure it starts at 1
                    versionBaseName += ` Ch-${chCount}`;
                }
    
                this.versionName = versionBaseName;
                console.log('Generated version name:', this.versionName);
            })
            .catch((error) => {
                console.error('Error generating version name:', error);
                this.setErrorMessage('Failed to generate Version Name.');
                throw error; // Ensure the error propagates
            });
    }

    // Load Products for Combobox
    loadProducts() {
        console.log('Loading products from price book');
        return getActiveProductsFromPriceBook({ opportunityId: this.opportunityId })
            .then((result) => {
                this.products = result.map((product) => ({
                    label: product.Product2.Name,
                    value: product.Product2Id, // Used for UI display and backend
                }));
                console.log('Loaded products:', this.products);
            })
            .catch((error) => {
                console.error('Error fetching products:', error);
                this.setErrorMessage('Failed to load products.');
            });
    }

    loadSyncedVersionLineItems() {
        console.log('Loading synced version line items');
        return getRelatedOpportunityVersions({ opportunityId: this.opportunityId })
            .then((versions) => {
                const syncedVersion = versions.find((version) => version.Syncing__c);
                if (syncedVersion) {
                    console.log('Found synced version:', syncedVersion);
                    return getOpportunityVersionLineItems({ versionId: syncedVersion.Id });
                } else {
                    console.log('No synced version found');
                    return [];
                }
            })
            .then((lineItems) => {
                this.versionLineItems = lineItems.map((item) => {
                    const matchingProduct = this.products.find(
                        (product) => product.label === item.Team_Name__c // Match by product name
                    );
                    return {
                        id: item.Id,
                        Team__c: matchingProduct ? matchingProduct.value : '', // Use Team__c for UI
                        ProductName: item.Team__c || '', // Use Name for UI display
                        Hours__c: item.Hours__c || 0,
                        Price__c: item.Price__c || 0,
                        Cost__c: item.Cost__c || 0,
                        Pricing_Complete__c: item.Pricing_Complete__c || false,
                        isLocked: item.Id ? true : false // NEW: Lock if ID exists
                    };
                });
                console.log('Loaded synced version line items:', this.versionLineItems);
                if (this.versionLineItems.length === 0) {
                    this.addVersionLineItem();
                }
            })
            .catch((error) => {
                console.error('Error fetching synced version line items:', error);
                this.setErrorMessage('Failed to load synced version line items.');
                this.addVersionLineItem(); // Fallback
            });
    }

    handleProductChange(event) {
        const { index } = event.target.dataset;
        console.log('Product changed at index:', index, 'New Value:', event.target.value);
        this.versionLineItems[index].Team__c = event.target.value;
    }

    addVersionLineItem() {
        this.versionLineItems = [
            ...this.versionLineItems,
            {
                id: `${Date.now()}-${Math.random()}`, // Generate a more unique id
                Team__c: '',
                ProductName: '',
                Hours__c: 0,
                Price__c: 0,
                Cost__c: 0,
                Pricing_Complete__c: false,
                isLocked: false // NEW: Ensure new items are editable
            },
        ];
    }

    handleLineItemChange(event) {
        const { index, field } = event.target.dataset;
        let value = event.target.value;
    
        // Find the line item using indexId
        const lineItem = this.versionLineItems.find((item) => item.id === index);
    
        if (!lineItem) {
            console.error('Invalid index. Line item not found:', index);
            return;
        }
    
        console.log('Line item change at index:', index, 'Field:', field, 'New Value:', value);
    
        if (field === 'Pricing_Complete__c') {
            // Checkbox returns a boolean
            lineItem.Pricing_Complete__c = event.target.checked;
            console.log('Toggled Pricing Complete:', lineItem.Pricing_Complete__c);
        } else if (field === 'Team__c') {
            lineItem.Team__c = value;
    
            // Find the matching product
            const matchingProduct = this.products.find((product) => product.value === value);
            if (matchingProduct) {
                lineItem.Team__c = matchingProduct.value;
                console.log('Updated Team:', lineItem.Team__c);
            } else {
                console.warn('No matching product found for Team__c:', value);
            }
        } else if (['Hours__c', 'Price__c', 'Cost__c'].includes(field)) {
            // Parse numeric fields
            lineItem[field] = parseFloat(value) || 0;
        } else {
            // Update other fields
            lineItem[field] = value;
        }
    
        // Ensure reactivity by updating the array reference
        this.versionLineItems = [...this.versionLineItems];
    }    
      
    handleDeleteLineItem(event) {
        const lineItemId = event.target.dataset.index; // Get the id of the item to delete
        // Filter out the deleted item
        this.versionLineItems = this.versionLineItems.filter((item) => item.id !== lineItemId);
        // Check if versionLineItems is empty
        if (this.versionLineItems.length === 0) {
            this.addVersionLineItem(); // Add a new blank line item
        }
    }       

    async handleSave() {
        console.log('Starting save operation for Version and Line Items');
        this.isLoading = true;
    
        try {
            const newLineItems = this.versionLineItems.map((item) => ({
                Team__c: item.Team__c,
                Hours__c: item.Hours__c,
                Price__c: item.Price__c,
                Cost__c: item.Cost__c,
                Pricing_Complete__c: item.Pricing_Complete__c // Ensure field is included
            }));
    
            console.log('Prepared new line items for save:', newLineItems);
    
            // Pass line items directly into createVersion
            const versionId = await createVersion({
                opportunityId: this.opportunityId,
                versionName: this.versionName,
                type: this.type, // Ensure type is passed correctly
                newLineItems: newLineItems, // Pass new line items directly
            });
    
            console.log('Created version with ID:', versionId);
    
            // No need for manageVersionLineItems since createVersion should handle it
    
            console.log('Successfully created version and line items');
    
            publish(this.messageContext, OpportunityVersionRefreshChannel, { refresh: true });
            console.log('Published Version Refresh Channel');
    
            this.close('save');
        } catch (error) {
            console.error('Error saving version and line items:', error);
            this.setErrorMessage('An error occurred while saving the version and line items.');
        } finally {
            this.isLoading = false;
            console.log('Save operation completed');
        }
    }    

    handleCancel() {
        console.log('Canceling operation');
        this.close('cancel');
    }

    setErrorMessage(message) {
        console.error('Error:', message);
        this.errorMessages = [{ message }];
    }

    clearErrorMessages() {
        console.log('Clearing error messages');
        this.errorMessages = null;
    }

}