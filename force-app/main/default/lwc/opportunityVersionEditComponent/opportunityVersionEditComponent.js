import LightningModal from 'lightning/modal';
import { api, wire } from 'lwc';

import { publish, MessageContext } from 'lightning/messageService';
import OpportunityVersionRefreshChannel from '@salesforce/messageChannel/OpportunityVersionRefreshChannel__c';
import OpportunityVersionLineItemRefreshChannel from '@salesforce/messageChannel/OpportunityVersionLineItemRefreshChannel__c';

import getOpportunityVersionLineItems from '@salesforce/apex/OpportunityVersionComponentController.getOpportunityVersionLineItems';
import manageVersionLineItems from '@salesforce/apex/OpportunityVersionComponentController.manageVersionLineItems';
import getActiveProductsFromPriceBook from '@salesforce/apex/OpportunityVersionComponentController.getActiveProductsFromPriceBook';

export default class OpportunityVersionEditComponent extends LightningModal {
    @api versionId; // Passed from the parent component
    @api opportunityId; // Accept opportunityId from the parent component
    versionLineItems = [];
    products = [];
    isLoading = false;
    errorMessages = null;
    originalLineItems = []; // Track the original line item details

    @wire(MessageContext) messageContext;

    connectedCallback() {
        console.log('Initializing Version Edit Component');
        this.isLoading = true;
        this.loadProducts()
            .then(() => this.loadVersionLineItems())
            .catch((error) => {
                console.error('Error during initialization:', error);
                this.setErrorMessage('Failed to load data for editing.');
            })
            .finally(() => {
                this.isLoading = false;
                console.log('Initialization complete');
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
                    pricebookEntryId: product.Id, // Used for Version Line Item creation
                }));
                console.log('Loaded products:', this.products);
            })
            .catch((error) => {
                console.error('Error fetching products:', error);
                this.setErrorMessage('Failed to load products.');
            });
    }

    loadVersionLineItems() {
        console.log('Loading version line items for Version ID:', this.versionId);
        return getOpportunityVersionLineItems({ versionId: this.versionId })
            .then((result) => {
                // Deep copy the original items to ensure immutability and apply matchingProduct logic
                this.originalLineItems = result.map((item) => {
                    const matchingProduct = this.products.find(
                        (product) => product.label === item.Team_Name__c
                    );
    
                    if (!matchingProduct) {
                        console.warn('No matching product found for Team__c:', item.Team__c);
                    }
    
                    return JSON.parse(
                        JSON.stringify({
                            indexId: item.Id, // Use the existing Salesforce ID as the indexId
                            id: item.Id,
                            Team__c: matchingProduct ? matchingProduct.value : '',
                            PricebookEntryId: matchingProduct ? matchingProduct.pricebookEntryId : item.PricebookEntryId,
                            ProductName: item.Team__c || '',
                            Hours__c: item.Hours__c || 0,
                            Price__c: item.Price__c || 0,
                            Cost__c: item.Cost__c || 0,
                        })
                    );
                });
    
                // Initialize the working array with a copy of the original items
                this.versionLineItems = JSON.parse(JSON.stringify(this.originalLineItems));
                console.log('Loaded version line items:', this.versionLineItems);
            })
            .catch((error) => {
                console.error('Error loading version line items:', error);
                this.setErrorMessage('Failed to load version line items.');
            });
    }    

    addVersionLineItem() {
        const newItem = {
            indexId: `${Date.now()}-${Math.random()}`, // Generate a unique placeholder ID
            id: null, // New items do not have an existing ID
            Team__c: '',
            PricebookEntryId: '',
            ProductName: '',
            Hours__c: 0,
            Price__c: 0,
            Cost__c: 0,
        };
        this.versionLineItems = [...this.versionLineItems, newItem];
        console.log('Added new line item:', newItem);
    }

    handleLineItemChange(event) {
        const { index, field } = event.target.dataset;
        const value = event.target.value;
    
        // Find the line item using indexId
        const lineItem = this.versionLineItems.find((item) => item.indexId === index);
    
        if (!lineItem) {
            console.error('Invalid index. Line item not found:', index);
            return;
        }
    
        console.log('Line item change at index:', index, 'Field:', field, 'New Value:', value);
    
        if (field === 'Team__c') {
            // Update Team__c
            lineItem.Team__c = value;
    
            // Find the matching product and update PricebookEntryId
            const matchingProduct = this.products.find((product) => product.value === value);
            if (matchingProduct) {
                lineItem.PricebookEntryId = matchingProduct.pricebookEntryId;
                console.log('Updated PricebookEntryId:', lineItem.PricebookEntryId);
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
    }       

    handleDeleteLineItem(event) {
        const indexId = event.target.dataset.index; // Use the placeholder or real ID
        console.log('Deleting line item with ID:', indexId);
        this.versionLineItems = this.versionLineItems.filter((item) => item.indexId !== indexId && item.id !== indexId);

        // Ensure there's always at least one line item
        if (this.versionLineItems.length === 0) {
            console.log('No line items left. Adding a new blank line item.');
            this.addVersionLineItem();
        }
    }

    async handleSave() {
        console.log('Starting save operation for Version Line Items');
    
        // Separate new, updated, and deleted line items
        const newLineItems = this.versionLineItems.filter((item) => !item.id); // New items without Salesforce IDs
        console.log('Checking for new line items...');
        console.log('New line items:', newLineItems);
    
        const updatedLineItems = this.versionLineItems.filter((item) => {
            if (!item.id) return false; // Ignore new items
    
            const original = this.originalLineItems.find((original) => original.id === item.id);
            if (!original) return false;
    
            // Check if any field has changed
            const isUpdated =
                original.PricebookEntryId !== item.PricebookEntryId ||
                original.Hours__c !== item.Hours__c ||
                original.Price__c !== item.Price__c ||
                original.Cost__c !== item.Cost__c;
    
            if (isUpdated) {
                console.log('Detected updated line item:', {
                    id: item.id,
                    original,
                    updated: item,
                });
            } else {
                console.log('No changes detected for line item:', {
                    id: item.id,
                    original,
                    current: item,
                });
            }
    
            return isUpdated;
        });
    
        const deletedLineItemIds = this.originalLineItems
            .filter((original) => !this.versionLineItems.some((item) => item.id === original.id))
            .map((item) => item.id);
        console.log('Deleted line item IDs:', deletedLineItemIds);
    
        // Map items for Apex
        const mappedNewLineItems = newLineItems.map((item) => ({
            VersionId: this.versionId,
            PricebookEntryId: item.PricebookEntryId,
            Hours__c: item.Hours__c,
            Price__c: item.Price__c,
            Cost__c: item.Cost__c,
        }));
    
        const mappedUpdatedLineItems = updatedLineItems.map((item) => ({
            Id: item.id,
            PricebookEntryId: item.PricebookEntryId,
            Hours__c: item.Hours__c,
            Price__c: item.Price__c,
            Cost__c: item.Cost__c,
        }));
    
        console.log('Prepared new line items:', mappedNewLineItems);
        console.log('Prepared updated line items:', mappedUpdatedLineItems);
        console.log('Prepared deleted line item IDs:', deletedLineItemIds);
    
        this.isLoading = true;
    
        try {
            console.log('Sending data to Apex...');
            await manageVersionLineItems({
                newLineItems: mappedNewLineItems,
                updatedLineItems: mappedUpdatedLineItems,
                deletedLineItemIds: deletedLineItemIds,
            });
            console.log('Successfully managed version line items');
            publish(this.messageContext, OpportunityVersionLineItemRefreshChannel, { refresh: true });
            publish(this.messageContext, OpportunityVersionRefreshChannel, { refresh: true });
            console.log('Published Version Line Item Refresh Channel');
            this.close('save');
        } catch (error) {
            console.error('Error saving version line items:', error);
            this.setErrorMessage('Failed to update version line items.');
        } finally {
            this.isLoading = false;
            console.log('Save operation completed');
        }
    }
    
    // Handle Cancel
    handleCancel() {
        console.log('Canceling operation');
        this.close('cancel');
    }

    // Set Error Messages
    setErrorMessage(message) {
        console.error('Error:', message);
        this.errorMessages = [{ message }];
    }
}
